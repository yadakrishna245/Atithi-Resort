import { randomUUID } from 'node:crypto';
import type { CreateReviewInput, Review } from '@atithi/shared';
import { PutCommand, TABLE, TransactWriteCommand, ddb, keys, nowIso, queryAll } from '../lib/dynamo.js';
import { ConflictError, ForbiddenError } from '../lib/errors.js';
import type { UserScope } from '../lib/auth.js';
import { bookingRepository } from './bookingRepository.js';

/**
 * Reviews can only be created from a completed stay.
 *
 * This is enforced structurally, not by policy:
 *   1. The booking must exist and belong to the reviewer.
 *   2. The booking status must be `completed`.
 *   3. A one-per-booking lock row is written in the same transaction.
 *
 * There is no code path that creates a review without a real booking, which
 * is what makes the "verified stay" badge meaningful rather than decorative.
 */
export const reviewRepository = {
  async listForProperty(propertyId: string, limit = 50): Promise<Review[]> {
    const rows = await queryAll<Review & { entityType: string }>(
      {
        TableName: TABLE(),
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `PROP#${propertyId}`, ':sk': 'REVIEW#' },
        ScanIndexForward: false,
      },
      limit,
    );

    return rows.map(({ entityType, ...rest }) => {
      void entityType;
      return rest as Review;
    });
  },

  async create(scope: UserScope, input: CreateReviewInput, displayName: string): Promise<Review> {
    const booking = await bookingRepository.getScoped(scope, input.bookingId);

    if (booking.userId !== scope.userId) throw new ForbiddenError();
    if (booking.status !== 'completed') {
      throw new ConflictError('You can review a stay once it is completed');
    }

    const reviewId = randomUUID();
    const review: Review = {
      reviewId,
      propertyId: booking.propertyId,
      bookingId: booking.bookingId,
      userId: scope.userId,
      displayName,
      ratings: input.ratings,
      title: input.title,
      body: input.body,
      locale: input.locale,
      stayedOn: booking.checkOut,
      verifiedStay: true,
      createdAt: nowIso(),
    };

    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: TABLE(),
                Item: {
                  ...keys.review(booking.propertyId, reviewId),
                  ...review,
                  orgId: booking.orgId,
                  entityType: 'Review',
                },
              },
            },
            {
              // One review per booking, guaranteed by the key.
              Put: {
                TableName: TABLE(),
                Item: {
                  ...keys.reviewLock(booking.bookingId),
                  reviewId,
                  userId: scope.userId,
                  entityType: 'ReviewLock',
                  createdAt: nowIso(),
                },
                ConditionExpression: 'attribute_not_exists(PK)',
              },
            },
          ],
        }),
      );
    } catch (err) {
      if ((err as { name?: string }).name === 'TransactionCanceledException') {
        throw new ConflictError('You have already reviewed this stay');
      }
      throw err;
    }

    return review;
  },

  async addPartnerResponse(orgId: string, propertyId: string, reviewId: string, body: string): Promise<void> {
    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          ...keys.review(propertyId, reviewId),
          partnerResponse: { body, respondedAt: nowIso() },
          orgId,
        },
        ConditionExpression: 'attribute_exists(PK) AND orgId = :org',
        ExpressionAttributeValues: { ':org': orgId },
      }),
    );
  },

  /** Aggregate computed from real reviews only — never seeded or padded. */
  aggregate(reviews: Review[]) {
    if (reviews.length === 0) return undefined;

    const sum = (pick: (r: Review) => number) => reviews.reduce((acc, r) => acc + pick(r), 0);
    const n = reviews.length;
    const round = (v: number) => Math.round((v / n) * 10) / 10;

    return {
      average: round(sum((r) => r.ratings.overall)),
      count: n,
      breakdown: {
        cleanliness: round(sum((r) => r.ratings.cleanliness)),
        accuracy: round(sum((r) => r.ratings.accuracy)),
        location: round(sum((r) => r.ratings.location)),
        staff: round(sum((r) => r.ratings.staff)),
        value: round(sum((r) => r.ratings.value)),
      },
    };
  },
};
