import { describe, expect, it } from 'vitest';
import type { Principal } from '@atithi/shared';
import { ForbiddenError } from '../lib/errors.js';
import { assertOwnership, orgScope, rejectImpersonation, userScope } from '../lib/auth.js';

/**
 * Tenant isolation regression suite.
 *
 * These tests exist because "one customer must never see another's data" is a
 * property of the system that has to be proven on every build, not assumed.
 * If any test here fails, the build must not ship.
 */

const guestA: Principal = {
  userId: 'user-a',
  roles: ['guest'],
  orgIds: [],
  locale: 'en',
};

const guestB: Principal = {
  userId: 'user-b',
  roles: ['guest'],
  orgIds: [],
  locale: 'en',
};

const partnerOrg1: Principal = {
  userId: 'partner-1',
  roles: ['partner_owner'],
  orgIds: ['org-1'],
  locale: 'en',
};

const partnerOrg2: Principal = {
  userId: 'partner-2',
  roles: ['partner_owner'],
  orgIds: ['org-2'],
  locale: 'en',
};

const multiOrgPartner: Principal = {
  userId: 'partner-3',
  roles: ['partner_owner'],
  orgIds: ['org-3', 'org-4'],
  locale: 'en',
};

describe('guest data isolation', () => {
  it('allows a guest to read a row they own', () => {
    expect(() => assertOwnership(userScope(guestA), { userId: 'user-a' })).not.toThrow();
  });

  it("blocks a guest from reading another guest's row", () => {
    expect(() => assertOwnership(userScope(guestA), { userId: 'user-b' })).toThrow(ForbiddenError);
  });

  it('blocks a guest from reading a row with no owner recorded', () => {
    expect(() => assertOwnership(userScope(guestA), {})).toThrow(ForbiddenError);
  });

  it('does not let two different guests resolve to the same scope', () => {
    expect(userScope(guestA).userId).not.toBe(userScope(guestB).userId);
  });
});

describe('partner organisation isolation', () => {
  it('allows a partner to access their own org', () => {
    const scope = orgScope(partnerOrg1, 'org-1');
    expect(scope.orgId).toBe('org-1');
  });

  it("blocks a partner from naming another org in the request", () => {
    expect(() => orgScope(partnerOrg1, 'org-2')).toThrow(ForbiddenError);
  });

  it("blocks a partner from reading another org's row", () => {
    const scope = orgScope(partnerOrg1, 'org-1');
    expect(() => assertOwnership(scope, { orgId: 'org-2' })).toThrow(ForbiddenError);
  });

  it('defaults to the first org when none is requested', () => {
    expect(orgScope(multiOrgPartner).orgId).toBe('org-3');
  });

  it('allows a multi-org partner to select any org they belong to', () => {
    expect(orgScope(multiOrgPartner, 'org-4').orgId).toBe('org-4');
  });

  it('blocks a multi-org partner from an org they do not belong to', () => {
    expect(() => orgScope(multiOrgPartner, 'org-5')).toThrow(ForbiddenError);
  });

  it('blocks a plain guest from the partner area entirely', () => {
    expect(() => orgScope(guestA, 'org-1')).toThrow(ForbiddenError);
  });

  it('blocks a partner whose account has no org linked', () => {
    const unlinked: Principal = { userId: 'p', roles: ['partner_staff'], orgIds: [], locale: 'en' };
    expect(() => orgScope(unlinked)).toThrow(ForbiddenError);
  });

  it('keeps two partners in separate scopes', () => {
    expect(orgScope(partnerOrg1).orgId).not.toBe(orgScope(partnerOrg2).orgId);
  });
});

describe('cross-boundary access', () => {
  it("blocks a partner scope from reading a guest's personal row", () => {
    const scope = orgScope(partnerOrg1, 'org-1');
    expect(() => assertOwnership(scope, { userId: 'user-a' })).toThrow(ForbiddenError);
  });

  it('blocks a public scope from reading any owned row', () => {
    expect(() => assertOwnership({ kind: 'public' }, { userId: 'user-a' })).toThrow(ForbiddenError);
  });

  it('permits platform staff to cross tenants (audited elsewhere)', () => {
    const scope = { kind: 'platform', userId: 'ops-1', reason: 'support ticket 123' } as const;
    expect(() => assertOwnership(scope, { userId: 'user-a', orgId: 'org-9' })).not.toThrow();
  });
});

describe('impersonation guards', () => {
  it('rejects a body that names a different user', () => {
    expect(() => rejectImpersonation(guestA, 'user-b')).toThrow(ForbiddenError);
  });

  it('accepts a body naming the caller themselves', () => {
    expect(() => rejectImpersonation(guestA, 'user-a')).not.toThrow();
  });

  it('ignores an absent user id', () => {
    expect(() => rejectImpersonation(guestA, undefined)).not.toThrow();
  });
});
