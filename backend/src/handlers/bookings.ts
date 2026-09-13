import { cancelBookingSchema, createBookingSchema, createReviewSchema } from '@atithi/shared';
import { authed, created, ok, pathParam } from '../lib/http.js';
import { userScope } from '../lib/auth.js';
import { claimIdempotencyKey, idempotencyKeyFrom } from '../lib/idempotency.js';
import { bookingRepository } from '../repositories/bookingRepository.js';
import { userRepository } from '../repositories/userRepository.js';
import { reviewRepository } from '../repositories/reviewRepository.js';
import { cancelBooking, createBooking } from '../services/bookingService.js';
import { propertyRepository } from '../repositories/propertyRepository.js';

/**
 * POST /bookings
 *
 * Every write here is scoped to the caller's own user id, taken from the JWT.
 * There is no field in the request that can change whose booking this becomes.
 */
export const createBookingHandler = authed(
  async ({ principal, body, event, log }) => {
    const scope = userScope(principal);

    // Protects against a double-tap or a network retry creating two bookings.
    const idempotencyKey = idempotencyKeyFrom(event.headers as Record<string, string | undefined>);
    await claimIdempotencyKey(idempotencyKey, principal.userId);

    const booking = await createBooking(scope, body);

    // Keep the guest's saved details fresh for the next checkout.
    await userRepository
      .update(scope, {
        fullName: body.primaryGuest.fullName,
        ...(body.primaryGuest.email ? { email: body.primaryGuest.email } : {}),
        ...(body.primaryGuest.address ? { address: body.primaryGuest.address } : {}),
        locale: body.locale,
      })
      .catch((error) => log.warn('Profile refresh after booking failed', { error }));

    log.info('Booking confirmed', { bookingId: booking.bookingId, reference: booking.reference });
    return created({ booking });
  },
  { bodySchema: createBookingSchema },
);

/** GET /bookings — only the caller's own bookings. */
export const listBookingsHandler = authed(async ({ principal, query }) => {
  const scope = userScope(principal);

  const result = await bookingRepository.listForUser(scope, {
    limit: query['limit'] ? Number(query['limit']) : 20,
    cursor: query['cursor'],
  });

  return ok({ data: result.items, cursor: result.cursor });
});

/** GET /bookings/{bookingId} — 403 if it belongs to anyone else. */
export const getBookingHandler = authed(async ({ principal, path }) => {
  const scope = userScope(principal);
  const bookingId = pathParam(path, 'bookingId');

  const booking = await bookingRepository.getScoped(scope, bookingId);
  const property = await propertyRepository.getPublicById(booking.propertyId);

  return ok({
    booking,
    property: property
      ? {
          name: property.name,
          address: property.address,
          contactPhone: property.contactPhone,
          checkInTime: property.checkInTime,
          checkOutTime: property.checkOutTime,
          geo: property.geo,
          policies: property.policies,
        }
      : null,
  });
});

/** POST /bookings/{bookingId}/cancel */
export const cancelBookingHandler = authed(
  async ({ principal, path, body, log }) => {
    const scope = userScope(principal);
    const bookingId = pathParam(path, 'bookingId');

    const result = await cancelBooking(scope, bookingId, body.reason);

    log.info('Booking cancelled', { bookingId, refundPaise: result.refundPaise, free: result.isFree });
    return ok({
      booking: result.booking,
      refund: {
        refundPaise: result.refundPaise,
        isFreeCancellation: result.isFree,
        // Refund timing is stated up front rather than buried in a help page.
        expectedInDays: result.refundPaise > 0 ? 7 : 0,
      },
    });
  },
  { bodySchema: cancelBookingSchema },
);

/**
 * POST /reviews
 *
 * Rejected unless the caller has a completed booking for that property. This
 * is why every rating on the platform is a real stay.
 */
export const createReviewHandler = authed(
  async ({ principal, body, log }) => {
    const scope = userScope(principal);

    const profile = await userRepository.get(scope);
    const displayName = buildDisplayName(profile?.fullName ?? 'Guest');

    const review = await reviewRepository.create(scope, body, displayName);

    log.info('Review created', { reviewId: review.reviewId, propertyId: review.propertyId });
    return created({ review });
  },
  { bodySchema: createReviewSchema },
);

/** "Ravi Kumar" → "Ravi K." — enough to feel human, not enough to identify. */
function buildDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'Guest';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]!.charAt(0).toUpperCase()}.`;
}
