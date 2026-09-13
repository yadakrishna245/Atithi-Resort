import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { env } from './env.js';

/**
 * Single-table DynamoDB access.
 *
 * On-demand billing keeps this at near-zero cost until there is real traffic,
 * and there is no idle spend — which is the whole point of the serverless
 * architecture chosen for this project.
 */

const base = new DynamoDBClient({
  region: env.region,
  maxAttempts: 3,
});

export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true, convertClassInstanceToMap: false },
  unmarshallOptions: { wrapNumbers: false },
});

export {
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
  TransactWriteCommand,
};

export const TABLE = () => env.tableName;

export const GSI1 = 'GSI1';
export const GSI2 = 'GSI2';

// ---------------------------------------------------------------------------
// Key builders — the physical layout of the single table
// ---------------------------------------------------------------------------

export const keys = {
  user: (userId: string) => ({ PK: `USER#${userId}`, SK: 'PROFILE' }),

  org: (orgId: string) => ({ PK: `ORG#${orgId}`, SK: 'PROFILE' }),

  membership: (orgId: string, userId: string) => ({
    PK: `ORG#${orgId}`,
    SK: `MEMBER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `ORG#${orgId}`,
  }),

  /**
   * Properties are partitioned under their owning org, which means a partner
   * query physically cannot reach another org's rows.
   * GSI1 gives direct lookup by id; GSI2 powers city search.
   */
  property: (orgId: string, propertyId: string) => ({
    PK: `ORG#${orgId}`,
    SK: `PROPERTY#${propertyId}`,
    GSI1PK: `PROP#${propertyId}`,
    GSI1SK: 'META',
  }),

  propertyById: (propertyId: string) => ({ GSI1PK: `PROP#${propertyId}`, GSI1SK: 'META' }),

  /** Only verified properties get a city index entry, so search cannot leak drafts. */
  citySearchIndex: (citySlug: string, rankScore: number, propertyId: string) => ({
    GSI2PK: `CITY#${citySlug}`,
    GSI2SK: `RANK#${String(1_000_000 - Math.round(rankScore)).padStart(7, '0')}#${propertyId}`,
  }),

  roomType: (propertyId: string, roomTypeId: string) => ({
    PK: `PROP#${propertyId}`,
    SK: `ROOM#${roomTypeId}`,
  }),

  inventory: (propertyId: string, roomTypeId: string, date: string) => ({
    PK: `PROP#${propertyId}`,
    SK: `INV#${roomTypeId}#${date}`,
  }),

  booking: (bookingId: string) => ({ PK: `BOOKING#${bookingId}`, SK: 'META' }),

  /** GSI1 → a guest's own bookings. GSI2 → a property's arrivals. */
  bookingIndexes: (args: {
    userId: string;
    orgId: string;
    createdAt: string;
    checkIn: string;
    bookingId: string;
  }) => ({
    GSI1PK: `USER#${args.userId}`,
    GSI1SK: `BOOKING#${args.createdAt}#${args.bookingId}`,
    GSI2PK: `ORG#${args.orgId}`,
    GSI2SK: `BOOKING#${args.checkIn}#${args.bookingId}`,
  }),

  bookingReference: (reference: string) => ({ PK: `BOOKINGREF#${reference}`, SK: 'POINTER' }),

  review: (propertyId: string, reviewId: string) => ({
    PK: `PROP#${propertyId}`,
    SK: `REVIEW#${reviewId}`,
  }),

  /** One review per booking — enforced by the key, not by application logic. */
  reviewLock: (bookingId: string) => ({ PK: `REVIEWLOCK#${bookingId}`, SK: 'LOCK' }),

  lead: (orgId: string, leadId: string) => ({ PK: `ORG#${orgId}`, SK: `LEAD#${leadId}` }),

  call: (orgId: string, callId: string) => ({ PK: `ORG#${orgId}`, SK: `CALL#${callId}` }),

  idempotency: (key: string) => ({ PK: `IDEMP#${key}`, SK: 'LOCK' }),

  translationCache: (propertyId: string, locale: string) => ({
    PK: `PROP#${propertyId}`,
    SK: `I18N#${locale}`,
  }),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function queryAll<T>(input: QueryCommandInput, maxItems = 500): Promise<T[]> {
  const items: T[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const res = await ddb.send(
      new QueryCommand({ ...input, ExclusiveStartKey: lastKey as never }),
    );
    items.push(...((res.Items ?? []) as T[]));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey && items.length < maxItems);

  return items.slice(0, maxItems);
}

export function encodeCursor(key: Record<string, unknown> | undefined): string | undefined {
  return key ? Buffer.from(JSON.stringify(key), 'utf8').toString('base64url') : undefined;
}

export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
}

/** Epoch-seconds TTL value for auto-expiring rows (holds, idempotency keys). */
export function ttlFromNow(seconds: number): number {
  return Math.floor(Date.now() / 1000) + seconds;
}

export function nowIso(): string {
  return new Date().toISOString();
}
