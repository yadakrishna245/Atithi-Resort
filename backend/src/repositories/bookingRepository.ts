import type { Booking, BookingStatus } from '@atithi/shared';
import {
  GSI1,
  GSI2,
  GetCommand,
  QueryCommand,
  TABLE,
  UpdateCommand,
  ddb,
  decodeCursor,
  encodeCursor,
  keys,
  nowIso,
} from '../lib/dynamo.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { AccessScope, OrgScope, UserScope } from '../lib/auth.js';
import { assertOwnership } from '../lib/auth.js';

interface BookingRow extends Booking {
  PK: string;
  SK: string;
  entityType: 'Booking';
}

function strip(row: BookingRow): Booking {
  const rest = { ...row } as Record<string, unknown>;
  for (const k of ['PK', 'SK', 'entityType', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK']) delete rest[k];
  return rest as unknown as Booking;
}

/**
 * Booking access rules:
 *   - A guest sees only bookings where booking.userId === their own id.
 *   - A partner sees only bookings where booking.orgId === their own org.
 *   - Queries are partitioned on those ids, and `assertOwnership` re-checks
 *     the returned row. Two independent barriers, deliberately.
 */
export const bookingRepository = {
  async getScoped(scope: AccessScope, bookingId: string): Promise<Booking> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: keys.booking(bookingId) }));
    const row = res.Item as BookingRow | undefined;
    if (!row) throw new NotFoundError('Booking');

    assertOwnership(scope, { userId: row.userId, orgId: row.orgId });
    return strip(row);
  },

  /** A guest's own bookings, newest first. */
  async listForUser(
    scope: UserScope,
    opts: { limit?: number; cursor?: string } = {},
  ): Promise<{ items: Booking[]; cursor?: string }> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: GSI1,
        KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
        ExpressionAttributeValues: { ':pk': `USER#${scope.userId}`, ':sk': 'BOOKING#' },
        ScanIndexForward: false,
        Limit: Math.min(opts.limit ?? 20, 50),
        ExclusiveStartKey: decodeCursor(opts.cursor) as never,
      }),
    );

    const items = ((res.Items ?? []) as BookingRow[]).map(strip);

    // Defence in depth: the index should make this impossible, so a hit here
    // means something is badly wrong and must not be returned silently.
    for (const b of items) {
      if (b.userId !== scope.userId) throw new ForbiddenError();
    }

    return { items, cursor: encodeCursor(res.LastEvaluatedKey) };
  },

  /** A partner's arrivals, ordered by check-in date. */
  async listForOrg(
    scope: OrgScope,
    opts: { fromCheckIn?: string; toCheckIn?: string; limit?: number; cursor?: string } = {},
  ): Promise<{ items: Booking[]; cursor?: string }> {
    const from = opts.fromCheckIn ?? '0000-00-00';
    const to = opts.toCheckIn ?? '9999-99-99';

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: GSI2,
        KeyConditionExpression: 'GSI2PK = :pk AND GSI2SK BETWEEN :from AND :to',
        ExpressionAttributeValues: {
          ':pk': `ORG#${scope.orgId}`,
          ':from': `BOOKING#${from}`,
          ':to': `BOOKING#${to}\uffff`,
        },
        Limit: Math.min(opts.limit ?? 50, 100),
        ExclusiveStartKey: decodeCursor(opts.cursor) as never,
      }),
    );

    const items = ((res.Items ?? []) as BookingRow[]).map(strip);
    for (const b of items) {
      if (b.orgId !== scope.orgId) throw new ForbiddenError();
    }

    return { items, cursor: encodeCursor(res.LastEvaluatedKey) };
  },

  async updateStatus(args: {
    scope: AccessScope;
    bookingId: string;
    to: BookingStatus;
    by: 'guest' | 'partner' | 'system' | 'support';
    note?: string;
    extra?: Partial<Pick<Booking, 'cancelledAt' | 'cancellationReason' | 'refundPaise' | 'amountPaidPaise' | 'paymentRef'>>;
  }): Promise<Booking> {
    const current = await this.getScoped(args.scope, args.bookingId);

    const change = {
      from: current.status,
      to: args.to,
      at: nowIso(),
      by: args.by,
      note: args.note,
    };

    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: keys.booking(args.bookingId),
        UpdateExpression: [
          'SET #status = :to',
          'statusHistory = list_append(if_not_exists(statusHistory, :empty), :change)',
          'updatedAt = :now',
          ...Object.keys(args.extra ?? {}).map((k) => `${k} = :${k}`),
        ].join(', '),
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':to': args.to,
          ':change': [change],
          ':empty': [],
          ':now': nowIso(),
          ':currentStatus': current.status,
          ...Object.fromEntries(Object.entries(args.extra ?? {}).map(([k, v]) => [`:${k}`, v])),
        },
        // Optimistic guard against a concurrent status change.
        ConditionExpression: '#status = :currentStatus',
        ReturnValues: 'ALL_NEW',
      }),
    );

    return strip(res.Attributes as BookingRow);
  },

  /** Resolves a human-readable reference (ATH-XXXXXX) to a booking id. */
  async findIdByReference(reference: string): Promise<string | null> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE(), Key: keys.bookingReference(reference.toUpperCase()) }),
    );
    return (res.Item?.['bookingId'] as string | undefined) ?? null;
  },
};
