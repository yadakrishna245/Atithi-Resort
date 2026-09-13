import {
  computeQuote,
  type AvailabilityOption,
  type AvailabilityResult,
  type RoomType,
} from '@atithi/shared';
import { propertyRepository } from '../repositories/propertyRepository.js';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import { NotFoundError } from '../lib/errors.js';

export interface AvailabilityQuery {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}

/**
 * Computes what is genuinely bookable.
 *
 * A room type is offered only when EVERY night in the range has an inventory
 * row, is open, and has enough unsold rooms. One missing night disqualifies
 * the whole stay — partial availability is reported honestly instead of being
 * papered over.
 */
export async function getAvailability(
  propertyId: string,
  query: AvailabilityQuery,
): Promise<AvailabilityResult> {
  const property = await propertyRepository.getPublicById(propertyId);
  if (!property) throw new NotFoundError('Property');

  const roomTypes = await propertyRepository.listRoomTypes(propertyId);
  const options: AvailabilityOption[] = [];
  const unpricedDates = new Set<string>();

  for (const roomType of roomTypes) {
    if (!fitsOccupancy(roomType, query)) continue;

    const { days, missingDates } = await inventoryRepository.getRange(
      propertyId,
      roomType.roomTypeId,
      query.checkIn,
      query.checkOut,
    );

    missingDates.forEach((d) => unpricedDates.add(d));

    // Any gap, closure, or shortfall on a single night rules this option out.
    if (missingDates.length > 0) continue;
    if (days.some((d) => d.closed)) continue;

    const roomsAvailable = Math.min(...days.map((d) => d.totalRooms - d.bookedRooms));
    if (roomsAvailable < query.rooms) continue;

    const minStay = Math.max(...days.map((d) => d.minStayNights));
    if (days.length < minStay) continue;

    const nightlyRates = days.map((d) => ({ date: d.date, ratePaise: d.baseRatePaise }));

    const quote = computeQuote({
      nightlyRatesPaise: nightlyRates.map((n) => n.ratePaise),
      rooms: query.rooms,
      adults: query.adults,
      children: query.children,
      roomType,
      payAtPropertyShare: 0,
    });

    options.push({ roomType, roomsAvailable, nightlyRates, quote });
  }

  options.sort((a, b) => a.quote.totalPayablePaise - b.quote.totalPayablePaise);

  return {
    propertyId,
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    nights: nightsBetween(query.checkIn, query.checkOut),
    options,
    unpricedDates: [...unpricedDates].sort(),
  };
}

function fitsOccupancy(roomType: RoomType, query: AvailabilityQuery): boolean {
  const totalGuests = query.adults + query.children;
  const capacity = roomType.maxOccupancy * query.rooms;
  return totalGuests <= capacity;
}

function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round(
    (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
  );
}
