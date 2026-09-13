import { availabilityQuerySchema, propertyQuestionSchema } from '@atithi/shared';
import { cacheable, ok, pathParam, publicRoute } from '../lib/http.js';
import { NotFoundError } from '../lib/errors.js';
import { propertyRepository } from '../repositories/propertyRepository.js';
import { reviewRepository } from '../repositories/reviewRepository.js';
import { inventoryRepository } from '../repositories/inventoryRepository.js';
import { getAvailability } from '../services/availabilityService.js';
import { answerPropertyQuestion } from '../ai/groundedAssistant.js';

/** GET /properties/{propertyId} — verified listings only. */
export const getPropertyHandler = publicRoute(async ({ path }) => {
  const propertyId = pathParam(path, 'propertyId');

  const property = await propertyRepository.getPublicById(propertyId);
  if (!property) throw new NotFoundError('Property');

  const [roomTypes, reviews] = await Promise.all([
    propertyRepository.listRoomTypes(propertyId),
    reviewRepository.listForProperty(propertyId, 20),
  ]);

  return cacheable(
    {
      property: { ...property, rating: reviewRepository.aggregate(reviews) },
      roomTypes,
      reviews,
      // Stated plainly so the guest knows what the rating is built from.
      reviewPolicy: 'verified_stays_only',
    },
    300,
  );
});

/**
 * GET /properties/{propertyId}/availability
 *
 * Reads published inventory only. Dates with no inventory row are returned in
 * `unpricedDates` rather than being quietly treated as available.
 */
export const getAvailabilityHandler = publicRoute(async ({ path, query }) => {
  const propertyId = pathParam(path, 'propertyId');
  const parsed = availabilityQuerySchema.parse(query);

  const result = await getAvailability(propertyId, parsed);
  return ok(result);
});

/** GET /properties/{propertyId}/reviews */
export const listReviewsHandler = publicRoute(async ({ path }) => {
  const propertyId = pathParam(path, 'propertyId');
  const reviews = await reviewRepository.listForProperty(propertyId, 50);

  return cacheable(
    { reviews, aggregate: reviewRepository.aggregate(reviews), reviewPolicy: 'verified_stays_only' },
    300,
  );
});

/**
 * POST /properties/{propertyId}/ask
 *
 * Grounded Q&A. The response always reports whether it was grounded, so the UI
 * can show a "the property will confirm" state instead of an invented answer.
 */
export const askPropertyHandler = publicRoute(
  async ({ path, body, log }) => {
    const propertyId = pathParam(path, 'propertyId');

    const property = await propertyRepository.getPublicById(propertyId);
    if (!property) throw new NotFoundError('Property');

    const roomTypes = await propertyRepository.listRoomTypes(propertyId);

    // A real, published rate range — never an estimate.
    const publishedRateRange = await computePublishedRange(propertyId, roomTypes.map((r) => r.roomTypeId));

    const answer = await answerPropertyQuestion({
      question: body.question,
      locale: body.locale,
      context: { property, roomTypes, publishedRateRange },
    });

    log.info('Property question answered', { propertyId, grounded: answer.grounded });
    return ok(answer);
  },
  { bodySchema: propertyQuestionSchema },
);

async function computePublishedRange(
  propertyId: string,
  roomTypeIds: string[],
): Promise<{ minPaise: number; maxPaise: number } | undefined> {
  if (roomTypeIds.length === 0) return undefined;

  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);

  const days = await inventoryRepository.listForProperty(propertyId, today, horizon);
  const rates = days.filter((d) => !d.closed && d.totalRooms > 0).map((d) => d.baseRatePaise);

  if (rates.length === 0) return undefined;
  return { minPaise: Math.min(...rates), maxPaise: Math.max(...rates) };
}
