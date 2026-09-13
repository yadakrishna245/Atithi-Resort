import { randomUUID } from 'node:crypto';
import {
  PUBLICLY_LISTABLE_STATUSES,
  type Property,
  type RoomType,
  type UpsertPropertyInput,
  type UpsertRoomTypeInput,
} from '@atithi/shared';
import {
  GSI1,
  GSI2,
  GetCommand,
  PutCommand,
  QueryCommand,
  TABLE,
  ddb,
  decodeCursor,
  encodeCursor,
  keys,
  nowIso,
  queryAll,
} from '../lib/dynamo.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import type { AccessScope, OrgScope } from '../lib/auth.js';

interface PropertyRow extends Property {
  PK: string;
  SK: string;
  entityType: 'Property';
}

function strip(row: PropertyRow): Property {
  const { PK, SK, entityType, ...rest } = row as PropertyRow & Record<string, unknown>;
  void PK;
  void SK;
  void entityType;
  delete (rest as Record<string, unknown>)['GSI1PK'];
  delete (rest as Record<string, unknown>)['GSI1SK'];
  delete (rest as Record<string, unknown>)['GSI2PK'];
  delete (rest as Record<string, unknown>)['GSI2SK'];
  return rest as unknown as Property;
}

export function citySlugOf(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Ranking score used to order search results. Deliberately simple and
 * explainable — no opaque "sponsored" boost, because paid placement is exactly
 * what makes OTA results untrustworthy.
 */
function rankScore(p: Pick<Property, 'rating' | 'photos' | 'amenities' | 'verificationStatus'>): number {
  const ratingPart = (p.rating?.average ?? 3.5) * 10_000;
  const reviewPart = Math.min(p.rating?.count ?? 0, 500) * 10;
  const completenessPart = Math.min(p.photos.filter((x) => x.verified).length, 20) * 50;
  const amenityPart = Math.min(p.amenities.length, 25) * 20;
  return Math.round(ratingPart + reviewPart + completenessPart + amenityPart);
}

export const propertyRepository = {
  /**
   * Public read. Returns only verified listings, so a draft or suspended
   * property can never be surfaced to a guest.
   */
  async getPublicById(propertyId: string): Promise<Property | null> {
    const idx = keys.propertyById(propertyId);
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: GSI1,
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: { ':pk': idx.GSI1PK, ':sk': idx.GSI1SK },
        Limit: 1,
      }),
    );

    const row = res.Items?.[0] as PropertyRow | undefined;
    if (!row) return null;
    if (!PUBLICLY_LISTABLE_STATUSES.includes(row.verificationStatus)) return null;
    return strip(row);
  },

  /** Partner read. Scoped to the caller's org by the partition key itself. */
  async getForOrg(scope: OrgScope, propertyId: string): Promise<Property> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE(), Key: keys.property(scope.orgId, propertyId) }),
    );
    const row = res.Item as PropertyRow | undefined;
    if (!row) throw new NotFoundError('Property');
    if (row.orgId !== scope.orgId) throw new ForbiddenError();
    return strip(row);
  },

  async listByOrg(scope: OrgScope): Promise<Property[]> {
    const rows = await queryAll<PropertyRow>({
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `ORG#${scope.orgId}`, ':sk': 'PROPERTY#' },
    });
    return rows.map(strip);
  },

  /**
   * City search over GSI2. Results are pre-sorted by rank because the sort key
   * embeds an inverted score, so DynamoDB returns them in order without a
   * post-query sort.
   */
  async searchByCity(args: {
    citySlug: string;
    limit: number;
    cursor?: string;
  }): Promise<{ items: Property[]; cursor?: string }> {
    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE(),
        IndexName: GSI2,
        KeyConditionExpression: 'GSI2PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `CITY#${args.citySlug}`,
          ':verified': 'verified',
        },
        FilterExpression: 'verificationStatus = :verified',
        Limit: Math.min(args.limit * 3, 150),
        ExclusiveStartKey: decodeCursor(args.cursor) as never,
      }),
    );

    const items = ((res.Items ?? []) as PropertyRow[]).map(strip);
    return { items, cursor: encodeCursor(res.LastEvaluatedKey) };
  },

  async create(scope: OrgScope, input: UpsertPropertyInput): Promise<Property> {
    const propertyId = randomUUID();
    const timestamp = nowIso();

    const property: Property = {
      propertyId,
      orgId: scope.orgId,
      ...input,
      citySlug: citySlugOf(input.address.city),
      photos: [],
      // A new listing is never publicly visible until ops verifies documents.
      verificationStatus: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          ...keys.property(scope.orgId, propertyId),
          ...property,
          entityType: 'Property',
        },
        ConditionExpression: 'attribute_not_exists(PK) OR attribute_not_exists(SK)',
      }),
    );

    return property;
  },

  async update(scope: OrgScope, propertyId: string, input: UpsertPropertyInput): Promise<Property> {
    const existing = await this.getForOrg(scope, propertyId);

    const updated: Property = {
      ...existing,
      ...input,
      citySlug: citySlugOf(input.address.city),
      // Material edits send the listing back for re-verification.
      verificationStatus: existing.verificationStatus === 'verified' ? 'pending_review' : existing.verificationStatus,
      updatedAt: nowIso(),
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          ...keys.property(scope.orgId, propertyId),
          ...updated,
          entityType: 'Property',
          // Search index entry is only written once verified — see publish().
          ...(updated.verificationStatus === 'verified'
            ? keys.citySearchIndex(updated.citySlug, rankScore(updated), propertyId)
            : {}),
        },
      }),
    );

    return updated;
  },

  /**
   * Called by ops after documents and photos are checked. This is the only
   * path that makes a listing publicly searchable.
   */
  async publishVerified(orgId: string, propertyId: string): Promise<Property> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: keys.property(orgId, propertyId) }));
    const row = res.Item as PropertyRow | undefined;
    if (!row) throw new NotFoundError('Property');

    const property = strip(row);
    const updated: Property = {
      ...property,
      verificationStatus: 'verified',
      verifiedAt: nowIso(),
      updatedAt: nowIso(),
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: {
          ...keys.property(orgId, propertyId),
          ...updated,
          ...keys.citySearchIndex(updated.citySlug, rankScore(updated), propertyId),
          entityType: 'Property',
        },
      }),
    );

    return updated;
  },

  // -------------------------------------------------------------------------
  // Room types
  // -------------------------------------------------------------------------

  async listRoomTypes(propertyId: string, opts: { includeInactive?: boolean } = {}): Promise<RoomType[]> {
    const rows = await queryAll<RoomType & { entityType: string }>({
      TableName: TABLE(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: { ':pk': `PROP#${propertyId}`, ':sk': 'ROOM#' },
    });

    return rows
      .filter((r) => opts.includeInactive || r.isActive)
      .map(({ entityType, ...rest }) => {
        void entityType;
        return rest as RoomType;
      });
  },

  async getRoomType(propertyId: string, roomTypeId: string): Promise<RoomType> {
    const res = await ddb.send(
      new GetCommand({ TableName: TABLE(), Key: keys.roomType(propertyId, roomTypeId) }),
    );
    if (!res.Item) throw new NotFoundError('Room type');
    return res.Item as RoomType;
  },

  async upsertRoomType(
    scope: OrgScope,
    propertyId: string,
    input: UpsertRoomTypeInput,
    roomTypeId?: string,
  ): Promise<RoomType> {
    // Proves the property belongs to this org before touching child rows.
    await this.getForOrg(scope, propertyId);

    const id = roomTypeId ?? randomUUID();
    const roomType: RoomType = { roomTypeId: id, propertyId, photoIds: [], ...input };

    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: { ...keys.roomType(propertyId, id), ...roomType, orgId: scope.orgId, entityType: 'RoomType' },
      }),
    );

    return roomType;
  },
};

/** Guards a scope that must be an org scope before partner operations run. */
export function assertOrgScope(scope: AccessScope): asserts scope is OrgScope {
  if (scope.kind !== 'org') throw new ForbiddenError();
}
