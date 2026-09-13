import {
  setInventorySchema,
  upsertPropertySchema,
  upsertRoomTypeSchema,
} from '@atithi/shared';
import { authed, created, ok, pathParam } from '../lib/http.js';
import { orgScope, requireRole } from '../lib/auth.js';
import { propertyRepository } from '../repositories/propertyRepository.js';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import { bookingRepository } from '../repositories/bookingRepository.js';

/**
 * Partner routes.
 *
 * Every handler derives its org from the JWT via `orgScope`. If the URL names
 * an org the token does not belong to, the request is rejected before any
 * database call happens.
 */

/** GET /partner/properties */
export const listPartnerPropertiesHandler = authed(async ({ principal, query }) => {
  const scope = orgScope(principal, query['orgId']);
  const properties = await propertyRepository.listByOrg(scope);

  return ok({
    data: properties,
    // Surfaced so partners always know why a listing is not visible to guests.
    notice: properties.some((p) => p.verificationStatus !== 'verified')
      ? 'Listings appear in search only after our team verifies your documents and photos.'
      : undefined,
  });
});

/** POST /partner/properties */
export const createPropertyHandler = authed(
  async ({ principal, body, query, log }) => {
    requireRole(principal, 'partner_owner', 'platform_admin');
    const scope = orgScope(principal, query['orgId']);

    const property = await propertyRepository.create(scope, body);

    log.info('Property created', { propertyId: property.propertyId, orgId: scope.orgId });
    return created({ property });
  },
  { bodySchema: upsertPropertySchema },
);

/** PUT /partner/properties/{propertyId} */
export const updatePropertyHandler = authed(
  async ({ principal, path, body, query }) => {
    const scope = orgScope(principal, query['orgId']);
    const propertyId = pathParam(path, 'propertyId');

    const property = await propertyRepository.update(scope, propertyId, body);
    return ok({ property });
  },
  { bodySchema: upsertPropertySchema },
);

/** POST /partner/properties/{propertyId}/room-types */
export const upsertRoomTypeHandler = authed(
  async ({ principal, path, body, query }) => {
    const scope = orgScope(principal, query['orgId']);
    const propertyId = pathParam(path, 'propertyId');

    const roomType = await propertyRepository.upsertRoomType(
      scope,
      propertyId,
      body,
      path['roomTypeId'],
    );

    return created({ roomType });
  },
  { bodySchema: upsertRoomTypeSchema },
);

/**
 * PUT /partner/properties/{propertyId}/inventory
 *
 * This is where real availability enters the system. Nothing else writes it,
 * which is what lets us promise that search results are genuinely bookable.
 */
export const setInventoryHandler = authed(
  async ({ principal, path, body, query, log }) => {
    const scope = orgScope(principal, query['orgId']);
    const propertyId = pathParam(path, 'propertyId');

    // Proves ownership before writing any child rows.
    await propertyRepository.getForOrg(scope, propertyId);

    const daysWritten = await inventoryRepository.setRange(scope, propertyId, body);

    log.info('Inventory published', { propertyId, daysWritten, roomTypeId: body.roomTypeId });
    return ok({ daysWritten, from: body.from, to: body.to });
  },
  { bodySchema: setInventorySchema },
);

/** GET /partner/properties/{propertyId}/inventory */
export const getInventoryHandler = authed(async ({ principal, path, query }) => {
  const scope = orgScope(principal, query['orgId']);
  const propertyId = pathParam(path, 'propertyId');

  await propertyRepository.getForOrg(scope, propertyId);

  const from = query['from'] ?? new Date().toISOString().slice(0, 10);
  const to = query['to'] ?? new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const days = await inventoryRepository.listForProperty(propertyId, from, to);
  return ok({ data: days, from, to });
});

/**
 * GET /partner/bookings
 *
 * Returns only this org's bookings. A partner never sees a guest's bookings at
 * any other property, and never sees another partner's arrivals.
 */
export const listPartnerBookingsHandler = authed(async ({ principal, query }) => {
  const scope = orgScope(principal, query['orgId']);

  const result = await bookingRepository.listForOrg(scope, {
    fromCheckIn: query['from'],
    toCheckIn: query['to'],
    limit: query['limit'] ? Number(query['limit']) : 50,
    cursor: query['cursor'],
  });

  return ok({ data: result.items, cursor: result.cursor });
});

/** GET /partner/bookings/{bookingId} */
export const getPartnerBookingHandler = authed(async ({ principal, path, query }) => {
  const scope = orgScope(principal, query['orgId']);
  const bookingId = pathParam(path, 'bookingId');

  const booking = await bookingRepository.getScoped(scope, bookingId);
  return ok({ booking });
});

/** POST /partner/bookings/{bookingId}/status */
export const updateBookingStatusHandler = authed(async ({ principal, path, body, query, log }) => {
  const scope = orgScope(principal, query['orgId']);
  const bookingId = pathParam(path, 'bookingId');

  const { status, note } = body as { status: string; note?: string };

  // A partner may only move a booking along the stay lifecycle.
  const allowed = ['checked_in', 'completed', 'no_show', 'cancelled_by_property'];
  if (!allowed.includes(status)) {
    return ok({ error: 'unsupported_status', allowed });
  }

  const booking = await bookingRepository.updateStatus({
    scope,
    bookingId,
    to: status as never,
    by: 'partner',
    note,
  });

  log.info('Booking status updated by partner', { bookingId, status });
  return ok({ booking });
});
