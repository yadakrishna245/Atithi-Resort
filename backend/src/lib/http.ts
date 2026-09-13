import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { AppError, ValidationError } from './errors.js';
import { logger, type Logger } from './logger.js';
import { getOptionalPrincipal, getPrincipal } from './auth.js';
import type { Principal } from '@atithi/shared';

export type HttpEvent = APIGatewayProxyEventV2WithJWTAuthorizer;
export type HttpResult = APIGatewayProxyStructuredResultV2;

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
} as const;

export function ok<T>(body: T, extraHeaders: Record<string, string> = {}): HttpResult {
  return { statusCode: 200, headers: { ...SECURITY_HEADERS, ...extraHeaders }, body: JSON.stringify(body) };
}

export function created<T>(body: T): HttpResult {
  return { statusCode: 201, headers: SECURITY_HEADERS, body: JSON.stringify(body) };
}

export function noContent(): HttpResult {
  return { statusCode: 204, headers: SECURITY_HEADERS, body: '' };
}

/** Public, non-personal responses may be cached at CloudFront. */
export function cacheable<T>(body: T, maxAgeSeconds: number): HttpResult {
  return {
    statusCode: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Cache-Control': `public, max-age=${maxAgeSeconds}, stale-while-revalidate=60`,
    },
    body: JSON.stringify(body),
  };
}

export interface HandlerArgs<TBody = unknown> {
  event: HttpEvent;
  context: Context;
  log: Logger;
  requestId: string;
  body: TBody;
  path: Record<string, string>;
  query: Record<string, string>;
}

export interface AuthedHandlerArgs<TBody = unknown> extends HandlerArgs<TBody> {
  principal: Principal;
}

interface RouteOptions<TBody> {
  // Bound to Zod's OUTPUT type, so fields declared with .default() arrive required.
  bodySchema?: ZodType<TBody, ZodTypeDef, unknown>;
  querySchema?: ZodType<Record<string, unknown>, ZodTypeDef, unknown>;
}

function parseBody(event: HttpEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

function buildArgs<TBody>(
  event: HttpEvent,
  context: Context,
  options: RouteOptions<TBody>,
  extraLogContext: Record<string, unknown>,
): HandlerArgs<TBody> {
  const requestId = event.requestContext?.requestId ?? context.awsRequestId;
  const route = `${event.requestContext?.http?.method} ${event.requestContext?.http?.path}`;

  const query = Object.fromEntries(
    Object.entries(event.queryStringParameters ?? {}).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;

  let body = parseBody(event) as TBody;
  if (options.bodySchema) body = options.bodySchema.parse(body);
  if (options.querySchema) options.querySchema.parse(query);

  return {
    event,
    context,
    requestId,
    body,
    path: (event.pathParameters ?? {}) as Record<string, string>,
    query,
    log: logger.child({ requestId, route, ...extraLogContext }),
  };
}

function toErrorResponse(err: unknown, requestId: string, log: Logger): HttpResult {
  if (err instanceof ZodError) {
    const details = err.issues.reduce<Record<string, string>>((acc, issue) => {
      acc[issue.path.join('.') || '_'] = issue.message;
      return acc;
    }, {});
    log.warn('Validation failed', { details });
    return {
      statusCode: 400,
      headers: SECURITY_HEADERS,
      body: JSON.stringify({
        error: { code: 'validation_error', message: 'Please check the highlighted fields', details, requestId },
      }),
    };
  }

  if (err instanceof AppError) {
    // A cross-tenant attempt is a security signal, not a routine 403.
    if (err.statusCode === 403) {
      log.warn('Access denied', { code: err.code, securityEvent: 'cross_tenant_access_denied' });
    } else if (err.statusCode >= 500) {
      log.error('Application error', { code: err.code, error: err });
    } else {
      log.info('Client error', { code: err.code, statusCode: err.statusCode });
    }

    return {
      statusCode: err.statusCode,
      headers: SECURITY_HEADERS,
      body: JSON.stringify({
        error: { code: err.code, message: err.message, details: err.details, requestId },
      }),
    };
  }

  log.error('Unhandled error', { error: err });
  return {
    statusCode: 500,
    headers: SECURITY_HEADERS,
    body: JSON.stringify({
      error: {
        code: 'internal_error',
        message: 'Something went wrong on our side. Please try again.',
        requestId,
      },
    }),
  };
}

/** Wraps a handler that requires a signed-in caller. */
export function authed<TBody = unknown>(
  handler: (args: AuthedHandlerArgs<TBody>) => Promise<HttpResult>,
  options: RouteOptions<TBody> = {},
) {
  return async (event: HttpEvent, context: Context): Promise<HttpResult> => {
    const requestId = event.requestContext?.requestId ?? context.awsRequestId;
    let log = logger.child({ requestId });
    try {
      const principal = getPrincipal(event);
      log = logger.child({ requestId, userId: principal.userId });
      const args = buildArgs<TBody>(event, context, options, { userId: principal.userId });
      return await handler({ ...args, principal });
    } catch (err) {
      return toErrorResponse(err, requestId, log);
    }
  };
}

/** Wraps a handler that works signed-out but personalises when signed in. */
export function publicRoute<TBody = unknown>(
  handler: (args: HandlerArgs<TBody> & { principal: Principal | null }) => Promise<HttpResult>,
  options: RouteOptions<TBody> = {},
) {
  return async (event: HttpEvent, context: Context): Promise<HttpResult> => {
    const requestId = event.requestContext?.requestId ?? context.awsRequestId;
    const log = logger.child({ requestId });
    try {
      const principal = getOptionalPrincipal(event);
      const args = buildArgs<TBody>(event, context, options, {});
      return await handler({ ...args, principal });
    } catch (err) {
      return toErrorResponse(err, requestId, log);
    }
  };
}

/** Reads a required path parameter. */
export function pathParam(path: Record<string, string>, name: string): string {
  const value = path[name];
  if (!value) throw new ValidationError(`Missing path parameter: ${name}`);
  return decodeURIComponent(value);
}
