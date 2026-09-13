import { ConflictError } from './errors.js';
import { PutCommand, TABLE, ddb, keys, ttlFromNow } from './dynamo.js';

/**
 * Idempotency guard for operations that must never double-execute —
 * chiefly booking creation, where a retried request would otherwise charge
 * the guest twice and consume two rooms.
 *
 * The lock row auto-expires via DynamoDB TTL, so there is nothing to clean up.
 */
export async function claimIdempotencyKey(
  key: string,
  scopeUserId: string,
  ttlSeconds = 86_400,
): Promise<void> {
  if (!key) return;

  // Namespacing by user stops one caller from burning another's key.
  const namespaced = `${scopeUserId}:${key}`;

  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          ...keys.idempotency(namespaced),
          entityType: 'IdempotencyLock',
          claimedAt: new Date().toISOString(),
          expiresAt: ttlFromNow(ttlSeconds),
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new ConflictError(
        'This request was already submitted. Please check your bookings before retrying.',
        { idempotencyKey: key },
      );
    }
    throw err;
  }
}

/** Pulls the Idempotency-Key header regardless of casing. */
export function idempotencyKeyFrom(headers: Record<string, string | undefined> | undefined): string {
  if (!headers) return '';
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === 'idempotency-key' && v) return v.slice(0, 200);
  }
  return '';
}
