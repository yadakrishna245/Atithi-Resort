import type { ConsentRecord, UpdateProfileInput, UserProfile } from '@atithi/shared';
import { DEFAULT_LOCALE } from '@atithi/shared';
import { GetCommand, PutCommand, TABLE, UpdateCommand, ddb, keys, nowIso } from '../lib/dynamo.js';
import { NotFoundError } from '../lib/errors.js';
import type { UserScope } from '../lib/auth.js';

/**
 * Profiles are keyed by the Cognito subject, so a user can only ever address
 * their own row — there is no query shape that returns somebody else's profile.
 */
export const userRepository = {
  async get(scope: UserScope): Promise<UserProfile | null> {
    const res = await ddb.send(new GetCommand({ TableName: TABLE(), Key: keys.user(scope.userId) }));
    if (!res.Item) return null;

    const row = { ...res.Item } as Record<string, unknown>;
    delete row['PK'];
    delete row['SK'];
    delete row['entityType'];
    return row as unknown as UserProfile;
  },

  async getOrCreate(scope: UserScope, seed: { phone: string; email?: string; fullName?: string }): Promise<UserProfile> {
    const existing = await this.get(scope);
    if (existing) return existing;

    const timestamp = nowIso();
    const profile: UserProfile = {
      userId: scope.userId,
      fullName: seed.fullName ?? '',
      email: seed.email,
      phone: seed.phone,
      locale: DEFAULT_LOCALE,
      consents: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await ddb.send(
      new PutCommand({
        TableName: TABLE(),
        Item: { ...keys.user(scope.userId), ...profile, entityType: 'UserProfile' },
        ConditionExpression: 'attribute_not_exists(PK)',
      }),
    ).catch((err: { name?: string }) => {
      // Concurrent first-login from two devices — the other write wins.
      if (err.name !== 'ConditionalCheckFailedException') throw err;
    });

    return (await this.get(scope)) ?? profile;
  },

  async update(scope: UserScope, input: UpdateProfileInput): Promise<UserProfile> {
    const entries = Object.entries(input).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      const current = await this.get(scope);
      if (!current) throw new NotFoundError('Profile');
      return current;
    }

    const names: Record<string, string> = {};
    const values: Record<string, unknown> = { ':now': nowIso() };
    const sets: string[] = ['updatedAt = :now'];

    for (const [key, value] of entries) {
      names[`#${key}`] = key;
      values[`:${key}`] = value;
      sets.push(`#${key} = :${key}`);
    }

    const res = await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: keys.user(scope.userId),
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: 'attribute_exists(PK)',
        ReturnValues: 'ALL_NEW',
      }),
    );

    const row = { ...res.Attributes } as Record<string, unknown>;
    delete row['PK'];
    delete row['SK'];
    delete row['entityType'];
    return row as unknown as UserProfile;
  },

  /** Consent is append-only so the audit trail survives revocation. */
  async recordConsent(scope: UserScope, consent: Omit<ConsentRecord, 'grantedAt'>): Promise<void> {
    const record: ConsentRecord = { ...consent, grantedAt: nowIso() };

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE(),
        Key: keys.user(scope.userId),
        UpdateExpression:
          'SET consents = list_append(if_not_exists(consents, :empty), :c), updatedAt = :now',
        ExpressionAttributeValues: { ':c': [record], ':empty': [], ':now': nowIso() },
      }),
    );
  },

  /** Most recent decision wins for a given purpose. */
  hasConsent(profile: UserProfile | null, purpose: ConsentRecord['purpose']): boolean {
    if (!profile) return false;
    const relevant = profile.consents.filter((c) => c.purpose === purpose);
    const latest = relevant.sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))[0];
    return latest?.granted ?? false;
  },
};
