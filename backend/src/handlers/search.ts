import { naturalSearchSchema, searchFiltersSchema } from '@atithi/shared';
import { cacheable, ok, publicRoute } from '../lib/http.js';
import { search } from '../services/searchService.js';
import { parseNaturalQuery } from '../ai/searchParser.js';
import { queryAll, TABLE } from '../lib/dynamo.js';

/**
 * GET /search
 *
 * Public and cacheable at CloudFront — it returns no personal data, which
 * keeps Lambda invocations (and cost) down on the highest-traffic route.
 */
export const searchHandler = publicRoute(async ({ query, log }) => {
  const filters = searchFiltersSchema.parse(query);

  log.info('Search', { citySlug: filters.citySlug, dated: Boolean(filters.checkIn) });
  const response = await search(filters);

  // Undated searches are stable enough to cache briefly; dated ones are not,
  // because availability changes minute to minute.
  return filters.checkIn ? ok(response) : cacheable(response, 120);
});

/**
 * POST /search/natural
 *
 * Accepts a free-text phrase in any supported Indian language, converts it to
 * filters, then runs the ordinary deterministic search. The AI never produces
 * results — only the filters, which are echoed back so the guest can see and
 * correct what was understood.
 */
export const naturalSearchHandler = publicRoute(
  async ({ body, log }) => {
    const { query, locale } = body;

    const knownCitySlugs = await loadKnownCities();
    const interpreted = await parseNaturalQuery({ query, locale, knownCitySlugs });

    log.info('Natural search parsed', {
      citySlug: interpreted.filters.citySlug,
      confidence: interpreted.confidence,
      unresolved: interpreted.unresolvedTerms.length,
    });

    const parsedFilters = searchFiltersSchema.parse(interpreted.filters);
    const response = await search(parsedFilters);

    return ok({ ...response, interpretedQuery: interpreted });
  },
  { bodySchema: naturalSearchSchema },
);

/**
 * The allow-list of destinations the parser may resolve to.
 *
 * Cached per Lambda container. Cities come from our own verified listings, so
 * the parser cannot route a guest to a destination we do not actually serve.
 */
let cityCache: { value: string[]; expiresAt: number } | null = null;

async function loadKnownCities(): Promise<string[]> {
  if (cityCache && cityCache.expiresAt > Date.now()) return cityCache.value;

  const rows = await queryAll<{ citySlug: string }>(
    {
      TableName: TABLE(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1SK = :sk',
      ExpressionAttributeValues: { ':sk': 'META' },
      ProjectionExpression: 'citySlug',
    },
    1000,
  ).catch(() => [] as Array<{ citySlug: string }>);

  const value = [...new Set(rows.map((r) => r.citySlug).filter(Boolean))];
  cityCache = { value, expiresAt: Date.now() + 5 * 60_000 };
  return value;
}
