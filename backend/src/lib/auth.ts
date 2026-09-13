import type { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';
import {
  DEFAULT_LOCALE,
  PARTNER_ROLES,
  PLATFORM_ROLES,
  SUPPORTED_LOCALES,
  type Locale,
  type Principal,
  type Role,
} from '@atithi/shared';
import { ForbiddenError, UnauthorizedError } from './errors.js';

/**
 * ===========================================================================
 * TENANT ISOLATION
 * ===========================================================================
 *
 * The single rule that keeps one customer's data away from another:
 *
 *   Every data-access call is scoped by a value derived from the verified JWT.
 *   Nothing that determines *whose* data is returned may come from the request
 *   body, query string or path.
 *
 * This module produces that scope. Repositories refuse to run without one.
 * ===========================================================================
 */

type JwtEvent = APIGatewayProxyEventV2WithJWTAuthorizer;

/** Extracts the caller identity from the API Gateway JWT authorizer output. */
export function getPrincipal(event: JwtEvent): Principal {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (!claims) throw new UnauthorizedError();

  const userId = String(claims['sub'] ?? '').trim();
  if (!userId) throw new UnauthorizedError('Token is missing a subject claim');

  // Cognito serialises groups either as an array or a bracketed string.
  const rawGroups = claims['cognito:groups'];
  const groups: string[] = Array.isArray(rawGroups)
    ? rawGroups.map(String)
    : typeof rawGroups === 'string'
      ? rawGroups.replace(/^\[|\]$/g, '').split(/[\s,]+/).filter(Boolean)
      : [];

  const roles = groups.filter((g): g is Role =>
    (['guest', 'partner_staff', 'partner_owner', 'platform_support', 'platform_admin'] as const).includes(
      g as Role,
    ),
  );

  // Every authenticated user is at minimum a guest.
  if (roles.length === 0) roles.push('guest');

  const orgClaim = claims['custom:orgIds'] ?? claims['custom:orgId'];
  const orgIds =
    typeof orgClaim === 'string' && orgClaim.trim()
      ? orgClaim.split(',').map((s) => s.trim()).filter(Boolean)
      : [];

  const localeClaim = String(claims['custom:locale'] ?? '');
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(localeClaim)
    ? (localeClaim as Locale)
    : DEFAULT_LOCALE;

  return {
    userId,
    email: claims['email'] ? String(claims['email']) : undefined,
    phone: claims['phone_number'] ? String(claims['phone_number']) : undefined,
    roles,
    orgIds,
    locale,
  };
}

/** Optional principal — for endpoints that work signed-out (public search). */
export function getOptionalPrincipal(event: JwtEvent): Principal | null {
  try {
    return getPrincipal(event);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Access scopes — the only values repositories accept
// ---------------------------------------------------------------------------

/** Restricts reads/writes to rows owned by exactly one end user. */
export interface UserScope {
  readonly kind: 'user';
  readonly userId: string;
}

/** Restricts reads/writes to rows owned by exactly one partner organisation. */
export interface OrgScope {
  readonly kind: 'org';
  readonly orgId: string;
  readonly userId: string;
}

/** Public, non-personal data only (verified listings). Never returns PII. */
export interface PublicScope {
  readonly kind: 'public';
}

/** Cross-tenant access for our own staff. Always audited by the caller. */
export interface PlatformScope {
  readonly kind: 'platform';
  readonly userId: string;
  readonly reason: string;
}

export type AccessScope = UserScope | OrgScope | PublicScope | PlatformScope;

export function userScope(principal: Principal): UserScope {
  return { kind: 'user', userId: principal.userId };
}

export function publicScope(): PublicScope {
  return { kind: 'public' };
}

/**
 * Builds an org scope, proving membership from the token.
 *
 * `requestedOrgId` may come from the URL — but it is only honoured if the JWT
 * says this user belongs to that org. That check is the whole point.
 */
export function orgScope(principal: Principal, requestedOrgId?: string): OrgScope {
  const isPartner = principal.roles.some((r) => PARTNER_ROLES.includes(r));
  if (!isPartner) throw new ForbiddenError('This area is for property partners only');

  if (principal.orgIds.length === 0) {
    throw new ForbiddenError('Your account is not linked to a property yet');
  }

  if (!requestedOrgId) {
    const first = principal.orgIds[0];
    if (!first) throw new ForbiddenError('Your account is not linked to a property yet');
    return { kind: 'org', orgId: first, userId: principal.userId };
  }

  if (!principal.orgIds.includes(requestedOrgId)) {
    throw new ForbiddenError();
  }

  return { kind: 'org', orgId: requestedOrgId, userId: principal.userId };
}

export function platformScope(principal: Principal, reason: string): PlatformScope {
  if (!principal.roles.some((r) => PLATFORM_ROLES.includes(r))) {
    throw new ForbiddenError();
  }
  if (!reason || reason.trim().length < 5) {
    throw new ForbiddenError('A reason is required for platform-level access');
  }
  return { kind: 'platform', userId: principal.userId, reason };
}

// ---------------------------------------------------------------------------
// Assertions used at the row level, after a read
// ---------------------------------------------------------------------------

/**
 * Last line of defence. Even if a query were somehow mis-scoped, this rejects
 * a row whose owner does not match the caller.
 */
export function assertOwnership(
  scope: AccessScope,
  row: { userId?: string; orgId?: string },
): void {
  switch (scope.kind) {
    case 'platform':
      return;
    case 'user':
      if (row.userId !== scope.userId) throw new ForbiddenError();
      return;
    case 'org':
      if (row.orgId !== scope.orgId) throw new ForbiddenError();
      return;
    case 'public':
      throw new ForbiddenError('This resource requires authentication');
  }
}

export function requireRole(principal: Principal, ...allowed: Role[]): void {
  if (!principal.roles.some((r) => allowed.includes(r))) {
    throw new ForbiddenError();
  }
}

export function hasRole(principal: Principal, ...allowed: Role[]): boolean {
  return principal.roles.some((r) => allowed.includes(r));
}

/**
 * Guards against a client trying to act on behalf of another user by putting
 * someone else's id in the payload.
 */
export function rejectImpersonation(principal: Principal, bodyUserId: unknown): void {
  if (typeof bodyUserId === 'string' && bodyUserId && bodyUserId !== principal.userId) {
    throw new ForbiddenError('You cannot act on behalf of another user');
  }
}
