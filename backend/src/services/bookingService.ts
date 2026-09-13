import { randomUUID, randomInt } from 'node:crypto';
import {
  computeQuote,
  computeRefund,
  freeCancellationDeadline,
  nightsBetween,
  type Booking,
  type CreateBookingInput,
  type PriceQuote,
} from '@atithi/shared';
import { TABLE, TransactWriteCommand, ddb, keys, nowIso } from '../lib/dynamo.js';
import {
  ConflictError,
  InventoryUnavailableError,
  NotFoundError,
  PriceChangedError,
  ValidationError,
} from '../lib/errors.js';
import type { UserScope } from '../lib/auth.js';
import { propertyRepository } from '../repositories/propertyRepository.js';
import { inventoryRepository, datesBetween } from '../repositories/inventoryRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { logger } from '../lib/logger.js';

/** Human-friendly reference. Ambiguous characters (0/O, 1/I) are excluded. */
function generateReference(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[randomInt(alphabet.length)];
  return `ATH-${out}`;
}

/**
 * Creates a booking and consumes inventory in ONE DynamoDB transaction.
 *
 * Either every night is decremented and the booking row is written, or nothing
 * happens. This is what prevents the classic overbooking race where two guests
 * both get the last room because availability was checked before writing.
 */
export async function createBooking(
  scope: UserScope,
  input: CreateBookingInput,
): Promise<Booking> {
  const log = logger.child({ userId: scope.userId, propertyId: input.propertyId });

  const property = await propertyRepository.getPublicById(input.propertyId);
  if (!property) throw new NotFoundError('Property');

  const roomType = await propertyRepository.getRoomType(input.propertyId, input.roomTypeId);
  if (!roomType.isActive) throw new ValidationError('That room type is no longer available');

  const nights = nightsBetween(input.checkIn, input.checkOut);
  const dates = datesBetween(input.checkIn, input.checkOut);
  if (dates.length === 0) throw new ValidationError('Select at least one night');

  // --- Re-read real inventory. Never trust anything the client sent. -------
  const { days, missingDates } = await inventoryRepository.getRange(
    input.propertyId,
    input.roomTypeId,
    input.checkIn,
    input.checkOut,
  );

  if (missingDates.length > 0) {
    throw new InventoryUnavailableError({
      reason: 'no_inventory_published',
      dates: missingDates,
    });
  }

  const closed = days.filter((d) => d.closed).map((d) => d.date);
  if (closed.length > 0) {
    throw new InventoryUnavailableError({ reason: 'dates_closed', dates: closed });
  }

  const shortfall = days.filter((d) => d.totalRooms - d.bookedRooms < input.rooms).map((d) => d.date);
  if (shortfall.length > 0) {
    throw new InventoryUnavailableError({ reason: 'sold_out', dates: shortfall });
  }

  // --- Recompute the price server-side ------------------------------------
  const payAtPropertyShare = input.paymentMode === 'pay_at_property' ? 1 : 0;

  const quote: PriceQuote = computeQuote({
    nightlyRatesPaise: days.map((d) => d.baseRatePaise),
    rooms: input.rooms,
    adults: input.adults,
    children: input.children,
    roomType,
    payAtPropertyShare,
  });

  // The guest must never be charged more than the total they were shown.
  if (quote.totalPayablePaise !== input.expectedTotalPaise) {
    log.warn('Quote drift detected between display and confirmation', {
      expected: input.expectedTotalPaise,
      actual: quote.totalPayablePaise,
    });
    throw new PriceChangedError(input.expectedTotalPaise, quote.totalPayablePaise);
  }

  // --- Build the booking --------------------------------------------------
  const bookingId = randomUUID();
  const reference = generateReference();
  const timestamp = nowIso();

  const freeCancelUntil = freeCancellationDeadline(
    input.checkIn,
    property.checkInTime,
    property.cancellationPolicy,
  );

  const booking: Booking = {
    bookingId,
    reference,
    userId: scope.userId,
    propertyId: input.propertyId,
    orgId: property.orgId,
    roomTypeId: input.roomTypeId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    rooms: input.rooms,
    primaryGuest: input.primaryGuest,
    members: input.members,
    adults: input.adults,
    children: input.children,
    originCity: input.originCity,
    purposeOfVisit: input.purposeOfVisit,
    specialRequests: input.specialRequests,
    estimatedArrivalTime: input.estimatedArrivalTime,
    quote,
    paymentMode: input.paymentMode,
    status: input.paymentMode === 'pay_at_property' ? 'confirmed' : 'pending_payment',
    statusHistory: [
      {
        from: null,
        to: input.paymentMode === 'pay_at_property' ? 'confirmed' : 'pending_payment',
        at: timestamp,
        by: 'guest',
      },
    ],
    amountPaidPaise: 0,
    refundPaise: 0,
    cancellationPolicy: property.cancellationPolicy,
    freeCancellationUntil: freeCancelUntil ?? undefined,
    source: 'web',
    locale: input.locale,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  // --- Atomic write: inventory + booking + reference pointer ---------------
  // DynamoDB allows 100 items per transaction; stays are capped at 30 nights.
  const inventoryUpdates = dates.map((date) => ({
    Update: {
      TableName: TABLE(),
      Key: keys.inventory(input.propertyId, input.roomTypeId, date),
      UpdateExpression: 'SET bookedRooms = bookedRooms + :n, updatedAt = :now',
      ConditionExpression:
        'attribute_exists(PK) AND closed = :false AND bookedRooms + :n <= totalRooms',
      ExpressionAttributeValues: { ':n': input.rooms, ':false': false, ':now': timestamp },
    },
  }));

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          ...inventoryUpdates,
          {
            Put: {
              TableName: TABLE(),
              Item: {
                ...keys.booking(bookingId),
                ...keys.bookingIndexes({
                  userId: scope.userId,
                  orgId: property.orgId,
                  createdAt: timestamp,
                  checkIn: input.checkIn,
                  bookingId,
                }),
                ...booking,
                entityType: 'Booking',
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
          {
            Put: {
              TableName: TABLE(),
              Item: {
                ...keys.bookingReference(reference),
                bookingId,
                entityType: 'BookingReference',
              },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          },
        ],
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'TransactionCanceledException') {
      log.warn('Booking transaction cancelled — inventory taken concurrently', { bookingId });
      throw new InventoryUnavailableError({ reason: 'concurrent_booking' });
    }
    throw err;
  }

  log.info('Booking created', { bookingId, reference, totalPaise: quote.totalPayablePaise });
  return booking;
}

/**
 * Cancels a booking and returns the inventory to the pool in the same
 * transaction, so a cancelled room is immediately resellable.
 */
export async function cancelBooking(
  scope: UserScope,
  bookingId: string,
  reason: string,
): Promise<{ booking: Booking; refundPaise: number; isFree: boolean }> {
  const booking = await bookingRepository.getScoped(scope, bookingId);

  const cancellable = ['pending_payment', 'confirmed'];
  if (!cancellable.includes(booking.status)) {
    throw new ConflictError(`A booking that is ${booking.status.replace(/_/g, ' ')} cannot be cancelled`);
  }

  const refund = computeRefund({
    amountPaidPaise: booking.amountPaidPaise,
    cancellationPolicy: booking.cancellationPolicy,
    freeCancellationUntil: booking.freeCancellationUntil ?? null,
  });

  const dates = datesBetween(booking.checkIn, booking.checkOut);
  const timestamp = nowIso();

  const releases = dates.map((date) => ({
    Update: {
      TableName: TABLE(),
      Key: keys.inventory(booking.propertyId, booking.roomTypeId, date),
      UpdateExpression: 'SET bookedRooms = bookedRooms - :n, updatedAt = :now',
      ConditionExpression: 'attribute_exists(PK) AND bookedRooms >= :n',
      ExpressionAttributeValues: { ':n': booking.rooms, ':now': timestamp },
    },
  }));

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        ...releases,
        {
          Update: {
            TableName: TABLE(),
            Key: keys.booking(bookingId),
            UpdateExpression:
              'SET #status = :cancelled, cancelledAt = :now, cancellationReason = :reason, refundPaise = :refund, updatedAt = :now, statusHistory = list_append(if_not_exists(statusHistory, :empty), :change)',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':cancelled': 'cancelled_by_guest',
              ':now': timestamp,
              ':reason': reason,
              ':refund': refund.refundPaise,
              ':empty': [],
              ':change': [
                { from: booking.status, to: 'cancelled_by_guest', at: timestamp, by: 'guest', note: reason },
              ],
              ':current': booking.status,
            },
            ConditionExpression: '#status = :current',
          },
        },
      ],
    }),
  );

  return {
    booking: { ...booking, status: 'cancelled_by_guest', refundPaise: refund.refundPaise },
    refundPaise: refund.refundPaise,
    isFree: refund.isFree,
  };
}
