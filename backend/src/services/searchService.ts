import type { Property, SearchFilters, SearchResponse, SearchResultItem } from '@atithi/shared';
import { propertyRepository } from '../repositories/propertyRepository.js';
import { getAvailability } from './availabilityService.js';
import { logger } from '../lib/logger.js';

/**
 * Search over verified listings.
 *
 * Two principles, both aimed at the things guests distrust about OTAs:
 *   1. Only genuinely bookable results are marked bookable. If dates are
 *      supplied, a property is shown as available only when real inventory
 *      covers every night.
 *   2. Ranking is explainable. Each result carries `matchReasons`, and there
 *      is no paid-placement boost.
 */
export async function search(filters: SearchFilters): Promise<SearchResponse> {
  if (!filters.citySlug) {
    return { items: [], total: 0 };
  }

  const { items: candidates, cursor } = await propertyRepository.searchByCity({
    citySlug: filters.citySlug,
    limit: filters.limit ?? 20,
    cursor: filters.cursor,
  });

  const filtered = candidates.filter((p) => matchesStaticFilters(p, filters));

  const results: SearchResultItem[] = [];
  const wantsDates = Boolean(filters.checkIn && filters.checkOut);

  for (const property of filtered) {
    if (results.length >= (filters.limit ?? 20)) break;

    let availability: SearchResultItem['availability'];

    if (wantsDates) {
      try {
        const result = await getAvailability(property.propertyId, {
          checkIn: filters.checkIn!,
          checkOut: filters.checkOut!,
          adults: filters.adults,
          children: filters.children,
          rooms: filters.rooms,
        });

        const lowestOption = result.options[0];
        // No real inventory for these dates → the property is simply not shown.
        if (!lowestOption) continue;

        const total = lowestOption.quote.totalPayablePaise;
        if (filters.minPricePaise != null && total < filters.minPricePaise) continue;
        if (filters.maxPricePaise != null && total > filters.maxPricePaise) continue;

        availability = { lowestOption, roomsLeft: lowestOption.roomsAvailable };
      } catch (error) {
        logger.warn('Availability lookup failed; omitting property from dated search', {
          propertyId: property.propertyId,
          error,
        });
        continue;
      }
    }

    results.push({
      property,
      availability,
      matchReasons: buildMatchReasons(property, filters),
    });
  }

  sortResults(results, filters.sort ?? 'recommended');

  return { items: results, cursor, total: results.length };
}

function policyStance(property: Property, key: string): string | undefined {
  return property.policies.find((p) => p.key === key)?.stance;
}

/**
 * Filters that can be evaluated without touching inventory.
 *
 * The couple-friendly and local-ID filters exist because being turned away at
 * check-in over these two policies is one of the most common — and most
 * avoidable — failures in Indian hospitality. We only pass a property when the
 * partner has explicitly declared the policy; silence never counts as a yes.
 */
function matchesStaticFilters(property: Property, f: SearchFilters): boolean {
  if (property.verificationStatus !== 'verified') return false;

  if (f.propertyTypes?.length && !f.propertyTypes.includes(property.type)) return false;

  if (f.amenities?.length) {
    const have = new Set(property.amenities);
    if (!f.amenities.every((a) => have.has(a))) return false;
  }

  if (f.minRating != null && (property.rating?.average ?? 0) < f.minRating) return false;

  if (f.requireCoupleFriendly && policyStance(property, 'unmarried_couples') !== 'allowed') return false;
  if (f.requireLocalIdAccepted && policyStance(property, 'local_id_accepted') !== 'allowed') return false;
  if (f.requirePetFriendly && !property.amenities.includes('pet_friendly')) return false;
  if (f.requireWheelchairAccessible && !property.amenities.includes('wheelchair_accessible')) return false;
  if (f.requirePureVegKitchen && !property.amenities.includes('pure_veg_kitchen')) return false;

  if (f.requireFreeCancellation && property.cancellationPolicy === 'non_refundable') return false;

  if (f.requirePayAtProperty && policyStance(property, 'payment_at_property') !== 'allowed') return false;

  return true;
}

/** Plain-language reasons shown on the result card — no black-box ranking. */
function buildMatchReasons(property: Property, f: SearchFilters): string[] {
  const reasons: string[] = [];

  if (property.verificationStatus === 'verified') reasons.push('search.reason.verified');
  if (property.photos.some((p) => p.verified)) reasons.push('search.reason.realPhotos');

  if ((property.rating?.count ?? 0) >= 5) reasons.push('search.reason.realReviews');

  if (f.requireCoupleFriendly && policyStance(property, 'unmarried_couples') === 'allowed') {
    reasons.push('search.reason.coupleFriendly');
  }
  if (f.requireLocalIdAccepted && policyStance(property, 'local_id_accepted') === 'allowed') {
    reasons.push('search.reason.localIdOk');
  }
  if (property.cancellationPolicy !== 'non_refundable') reasons.push('search.reason.freeCancellation');
  if (property.aiReceptionistEnabled) reasons.push('search.reason.alwaysAnswers');

  return reasons;
}

function sortResults(items: SearchResultItem[], sort: NonNullable<SearchFilters['sort']>): void {
  const priceOf = (i: SearchResultItem) =>
    i.availability?.lowestOption.quote.totalPayablePaise ?? i.property.lowestNightlyRatePaise ?? Infinity;

  switch (sort) {
    case 'price_low':
      items.sort((a, b) => priceOf(a) - priceOf(b));
      break;
    case 'price_high':
      items.sort((a, b) => priceOf(b) - priceOf(a));
      break;
    case 'rating':
      items.sort((a, b) => (b.property.rating?.average ?? 0) - (a.property.rating?.average ?? 0));
      break;
    case 'distance':
      items.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
      break;
    default:
      // 'recommended' preserves the index order, which already encodes rank.
      break;
  }
}
