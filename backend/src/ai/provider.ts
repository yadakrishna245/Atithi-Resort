import type { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { env } from '../lib/env.js';
import { UpstreamError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Provider-agnostic LLM access.
 *
 * The key lives in Secrets Manager (or IAM, when using Bedrock) and is cached
 * for the lifetime of the Lambda container so we are not charged for a secret
 * fetch on every request.
 *
 * Nothing in this module decides what is true. It only moves text. All factual
 * constraints are enforced by the callers in this directory.
 */

export interface LlmRequest {
  system: string;
  user: string;
  /** Ask for strict JSON. The caller still validates with Zod — never trust it. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

let cachedKey: string | null = null;
const secrets = new SecretsManagerClient({ region: env.region });

/**
 * The Bedrock SDK is loaded on first use, not at module load.
 *
 * Handlers such as search import this file transitively; eagerly pulling the
 * Bedrock client into every one of them would add avoidable cold-start weight.
 */
let bedrockClient: BedrockRuntimeClient | null = null;

async function getBedrockClient(): Promise<BedrockRuntimeClient> {
  if (!bedrockClient) {
    const { BedrockRuntimeClient: Client } = await import('@aws-sdk/client-bedrock-runtime');
    bedrockClient = new Client({ region: env.ai.bedrockRegion });
  }
  return bedrockClient;
}

async function getApiKey(): Promise<string> {
  if (cachedKey) return cachedKey;

  if (env.ai.apiKeySecretId) {
    const res = await secrets.send(new GetSecretValueCommand({ SecretId: env.ai.apiKeySecretId }));
    const raw = res.SecretString ?? '';
    // Supports both a bare string and {"apiKey":"..."} shapes.
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      cachedKey = parsed['apiKey'] ?? parsed['key'] ?? raw;
    } catch {
      cachedKey = raw;
    }
  } else {
    cachedKey = env.ai.inlineApiKey;
  }

  if (!cachedKey) throw new UpstreamError('AI provider (no API key configured)');
  return cachedKey;
}

export async function callLlm(req: LlmRequest): Promise<string> {
  const maxTokens = Math.min(req.maxTokens ?? env.ai.maxOutputTokens, env.ai.maxOutputTokens);
  const temperature = req.temperature ?? 0; // Deterministic by default.

  const started = Date.now();
  try {
    let text: string;

    switch (env.ai.provider) {
      case 'bedrock':
        text = await callBedrock(req, maxTokens, temperature);
        break;
      case 'openai':
        text = await callOpenAi(req, maxTokens, temperature);
        break;
      case 'anthropic':
        text = await callAnthropic(req, maxTokens, temperature);
        break;
      default:
        throw new UpstreamError(`Unknown AI provider: ${env.ai.provider}`);
    }

    logger.info('LLM call complete', { provider: env.ai.provider, durationMs: Date.now() - started });
    return text;
  } catch (error) {
    logger.error('LLM call failed', { provider: env.ai.provider, error });
    throw error instanceof UpstreamError ? error : new UpstreamError('AI provider');
  }
}

async function callBedrock(req: LlmRequest, maxTokens: number, temperature: number): Promise<string> {
  const { InvokeModelCommand } = await import('@aws-sdk/client-bedrock-runtime');
  const bedrock = await getBedrockClient();

  const body = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: maxTokens,
    temperature,
    system: req.system,
    messages: [{ role: 'user', content: [{ type: 'text', text: req.user }] }],
  };

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: env.ai.bedrockModelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    }),
  );

  const decoded = JSON.parse(new TextDecoder().decode(res.body)) as {
    content?: Array<{ text?: string }>;
  };
  return decoded.content?.[0]?.text ?? '';
}

async function callOpenAi(req: LlmRequest, maxTokens: number, temperature: number): Promise<string> {
  const key = await getApiKey();

  // ponytail: Moonshot/Kimi rejects any temperature other than 1 ("only 1 is
  // allowed for this model") on kimi-k2.6/k3. Determinism still comes from the
  // grounding scanner in groundedAssistant.ts, not from temperature.
  const isMoonshot = env.ai.openaiBaseUrl.includes('moonshot.ai');
  const effectiveTemperature = isMoonshot ? 1 : temperature;

  // ponytail: every current Kimi model is a thinking model — reasoning is always
  // on and cannot be disabled (reasoning_effort only accepts "max"). Reasoning
  // tokens count against max_tokens, so a tight cap (e.g. 400) is consumed
  // entirely by reasoning and leaves content empty with finish_reason=length.
  // Moonshot's own guidance is to raise the budget. Ceiling: reasoning length is
  // unbounded, so a pathological query could still truncate; 2048 covered the
  // parser and grounding prompts seen in practice (~1000 reasoning tokens).
  const effectiveMaxTokens = isMoonshot ? Math.max(maxTokens, 2048) : maxTokens;

  const res = await fetch(`${env.ai.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: env.ai.openaiModel,
      max_tokens: effectiveMaxTokens,
      temperature: effectiveTemperature,
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
  });

  if (!res.ok) throw new UpstreamError(`OpenAI-compatible API (${res.status})`);

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(req: LlmRequest, maxTokens: number, temperature: number): Promise<string> {
  const key = await getApiKey();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ai.anthropicModel,
      max_tokens: maxTokens,
      temperature,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
    }),
  });

  if (!res.ok) throw new UpstreamError(`Anthropic (${res.status})`);

  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? '';
}

/** Extracts a JSON object from a model response that may be fenced or padded. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
