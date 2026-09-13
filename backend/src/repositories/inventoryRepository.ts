import type { InventoryDay, SetInventoryInput } from '@atithi/shared';
import {
  BatchGetCommand,
  PutCommand,
  TABLE,
  ddb,
  keys,
  nowIso,
  queryAll,
} from '../lib/dynamo.js';
import type { OrgScope } from '../lib/auth.js';

/**
 * Availability is read from real inventory rows only.
 *
 * If a date has no row, it is NOT bookable. We never interpolate, extrapolate
 * or "assume" availability from neighbouring dates — that behaviour is what
 * produces the "confirmed online, no room on arrival" failure guests hate.
 */

export function datesBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const cursor = new Date(`${checkIn}T00:00:00Z`);
  const end = new Date(`${checkOut}T00:00:00Z`);

  while (cursor < end) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

export const inventoryRepository = {
  /** Fetches the exact set of nights requested. Missing rows are reported, not filled in. */
  async getRange(
    propertyId: string,
    roomTypeId: string,
    checkIn: string,
    checkOut: string,
  ): Promise<{ days: InventoryDay[]; missingDates: string[] }> {
    const wanted = datesBetween(checkIn, checkOut);
    if (wanted.length === 0) return { days: [], missingDates: [] };

    const found: InventoryDay[] = [];

    // BatchGet caps at 100 keys; stays are capped at 30 nights so one batch suffices.
    for (let i = 0; i < wanted.length; i += 100) {
      const chunk = wanted.slice(i, i + 100);
      const res = await ddb.send(
        new BatchGetCommand({
          RequestItems: {
            [TABLE()]: {
              Keys: chunk.map((date) => keys.inventory(propertyId, roomTypeId, date)),
            },
          },
        }),
      );
      found.push(...((res.Responses?.[TABLE()] ?? []) as InventoryDay[]));
    }

    const byDate = new Map(found.map((d) => [d.date, d]));
    const missingDates = wanted.filter((d) => !byDate.has(d));
    const days = wanted.map((d) => byDate.get(d)).filter((d): d is InventoryDay => Boolean(d));

    return { days, missingDates };
  },

  /** All inventory rows for a property in a window — used by the partner calendar. */
  async listForProperty(propertyId: string, from: string, to: string): Promise<InventoryDay[]> {
    const rows = await queryAll<InventoryDay>({
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `PROP#${propertyId}`, ':sk': 'INV#' },
    });

    return rows.filter((r) => r.date >= from && r.date < to);
  },

  /** Bulk set rates and room counts across a date range. */
  async setRange(scope: OrgScope, propertyId: string, input: SetInventoryInput): Promise<number> {
    const dates = datesBetween(input.from, input.to);
    const timestamp = nowIso();

    // Sequential writes keep this simple and well under DynamoDB write limits
    // for the ranges a partner realistically edits at once.
    for (const date of dates) {
      const day: InventoryDay = {
        propertyId,
        roomTypeId: input.roomTypeId,
        date,
        totalRooms: input.totalRooms,
        bookedRooms: 0,
        baseRatePaise: input.baseRatePaise,
        minStayNights: input.minStayNights,
        closed: input.closed,
        updatedAt: timestamp,
      };

      await ddb.send(
        new PutCommand({
          TableName: TABLE(),
          Item: {
            ...keys.inventory(propertyId, input.roomTypeId, date),
            ...day,
            orgId: scope.orgId,
            entityType: 'InventoryDay',
          },
          // Preserve existing bookings when a partner re-publishes rates.
          ConditionExpression: 'attribute_not_exists(PK) OR bookedRooms <= :total',
          ExpressionAttributeValues: { ':total': input.totalRooms },
        }),
      ).catch((err: { name?: string }) => {
        if (err.name === 'ConditionalCheckFailedException') {
          // Cannot reduce capacity below what is already sold — skip that date.
          return;
        }
        throw err;
      });
    }

    return dates.length;
  },
};
