/**
 * Structured JSON logging.
 *
 * Two hard rules, both enforced here rather than left to discipline:
 *   1. Every line carries tenant context so multi-tenant debugging is possible.
 *   2. Phone numbers and emails are masked. Logs are not a PII store.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  requestId?: string;
  userId?: string;
  orgId?: string;
  propertyId?: string;
  bookingId?: string;
  route?: string;
  [key: string]: unknown;
}

const PHONE_RE = /(\+91)(\d{2})(\d{5})(\d{3})/g;
const EMAIL_RE = /([\w.+-]{1,3})[\w.+-]*@([\w-]+\.[\w.-]+)/g;
const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'idToken',
  'refreshToken',
  'authorization',
  'apiKey',
  'secret',
  'idProofNumber',
  'aadhaar',
  'cardNumber',
  'cvv',
  'otp',
]);

export function maskPhone(value: string): string {
  return value.replace(PHONE_RE, (_m, cc, a, _b, d) => `${cc}${a}*****${d}`);
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    return value.replace(PHONE_RE, (_m, cc, a, _b, d) => `${cc}${a}*****${d}`).replace(EMAIL_RE, '$1***@$2');
  }
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k) ? '[redacted]' : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, message: string, context: LogContext = {}): void {
  const line = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(scrub(context) as Record<string, unknown>),
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const logger = {
  debug: (m: string, c?: LogContext) => {
    if (process.env['LOG_LEVEL'] === 'debug') emit('debug', m, c);
  },
  info: (m: string, c?: LogContext) => emit('info', m, c),
  warn: (m: string, c?: LogContext) => emit('warn', m, c),
  error: (m: string, c?: LogContext & { error?: unknown }) => {
    const { error, ...rest } = c ?? {};
    emit('error', m, {
      ...rest,
      errorMessage: error instanceof Error ? error.message : String(error ?? ''),
      errorName: error instanceof Error ? error.name : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });
  },

  /** Child logger that pins tenant context onto every subsequent line. */
  child(base: LogContext) {
    return {
      debug: (m: string, c?: LogContext) => logger.debug(m, { ...base, ...c }),
      info: (m: string, c?: LogContext) => logger.info(m, { ...base, ...c }),
      warn: (m: string, c?: LogContext) => logger.warn(m, { ...base, ...c }),
      error: (m: string, c?: LogContext & { error?: unknown }) => logger.error(m, { ...base, ...c }),
    };
  },
};

export type Logger = ReturnType<typeof logger.child>;
