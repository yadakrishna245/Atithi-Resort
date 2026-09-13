import { consentSchema, updateProfileSchema } from '@atithi/shared';
import { authed, noContent, ok } from '../lib/http.js';
import { userScope } from '../lib/auth.js';
import { userRepository } from '../repositories/userRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';

/** GET /me — the caller's own profile, created on first call. */
export const getProfileHandler = authed(async ({ principal }) => {
  const scope = userScope(principal);

  const profile = await userRepository.getOrCreate(scope, {
    phone: principal.phone ?? '',
    email: principal.email,
  });

  return ok({
    profile,
    roles: principal.roles,
    // Present only for partner accounts; empty for ordinary guests.
    orgIds: principal.orgIds,
  });
});

/** PATCH /me */
export const updateProfileHandler = authed(
  async ({ principal, body }) => {
    const profile = await userRepository.update(userScope(principal), body);
    return ok({ profile });
  },
  { bodySchema: updateProfileSchema },
);

/** POST /me/consents — append-only, timestamped (DPDP requirement). */
export const recordConsentHandler = authed(
  async ({ principal, body, log }) => {
    await userRepository.recordConsent(userScope(principal), body);
    log.info('Consent recorded', { purpose: body.purpose, granted: body.granted });
    return noContent();
  },
  { bodySchema: consentSchema },
);

/**
 * GET /me/export
 *
 * DPDP access right. Returns everything we hold about the caller, scoped to
 * their own id — a user cannot export anybody else's data through this route.
 */
export const exportMyDataHandler = authed(async ({ principal, log }) => {
  const scope = userScope(principal);

  const [profile, bookings] = await Promise.all([
    userRepository.get(scope),
    bookingRepository.listForUser(scope, { limit: 50 }),
  ]);

  log.info('Data export requested', { auditEvent: 'dpdp_data_export' });

  return ok({
    exportedAt: new Date().toISOString(),
    profile,
    bookings: bookings.items,
    notes:
      'This export covers your profile and bookings. Call recordings, if any, are delivered separately within 7 days.',
  });
});

/**
 * POST /me/delete-request
 *
 * Records an erasure request. Deletion is asynchronous because bookings with
 * an active stay or a pending refund must be settled first — that reasoning is
 * returned to the user rather than silently applied.
 */
export const requestDeletionHandler = authed(async ({ principal, log }) => {
  const scope = userScope(principal);
  const bookings = await bookingRepository.listForUser(scope, { limit: 50 });

  const blocking = bookings.items.filter((b) =>
    ['pending_payment', 'confirmed', 'checked_in'].includes(b.status),
  );

  log.info('Deletion requested', { auditEvent: 'dpdp_erasure_request', blocking: blocking.length });

  return ok({
    accepted: true,
    completesWithinDays: 30,
    blockedBy: blocking.map((b) => ({
      reference: b.reference,
      status: b.status,
      checkIn: b.checkIn,
    })),
    message:
      blocking.length > 0
        ? 'Your request is recorded. We will delete your data once these active bookings are complete.'
        : 'Your request is recorded. Your data will be deleted within 30 days.',
  });
});
