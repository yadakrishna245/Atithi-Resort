/**
 * Typed environment access.
 *
 * Fails fast at cold start rather than producing confusing runtime errors
 * halfway through a request.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name]?.trim() || fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  stage: optional('STAGE', 'dev'),
  region: optional('AWS_REGION', 'ap-south-1'),

  get tableName(): string {
    return required('TABLE_NAME');
  },

  get mediaBucket(): string {
    return required('MEDIA_BUCKET');
  },

  userPoolId: optional('USER_POOL_ID'),

  ai: {
    provider: optional('AI_PROVIDER', 'bedrock') as 'bedrock' | 'openai' | 'anthropic',
    bedrockModelId: optional('BEDROCK_MODEL_ID', 'anthropic.claude-3-haiku-20240307-v1:0'),
    bedrockRegion: optional('BEDROCK_REGION', optional('AWS_REGION', 'ap-south-1')),
    openaiModel: optional('OPENAI_MODEL', 'gpt-4o-mini'),
    anthropicModel: optional('ANTHROPIC_MODEL', 'claude-3-5-haiku-latest'),
    apiKeySecretId: optional('AI_API_KEY_SECRET_ID'),
    /** Direct key is only for local development — production uses Secrets Manager. */
    inlineApiKey: optional('OPENAI_API_KEY') || optional('ANTHROPIC_API_KEY'),
    maxOutputTokens: optionalNumber('AI_MAX_OUTPUT_TOKENS', 800),
  },

  isProd(): boolean {
    return this.stage === 'prod';
  },
} as const;
