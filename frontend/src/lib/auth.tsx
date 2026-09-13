import { Amplify } from 'aws-amplify';
import {
  confirmSignIn,
  fetchAuthSession,
  getCurrentUser,
  signIn,
  signOut as amplifySignOut,
  signUp,
  type SignInOutput,
} from 'aws-amplify/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

/**
 * Cognito authentication.
 *
 * Phone-first, because that is how Indian users expect to sign in and because
 * the phone number is what a property needs in order to call a guest back.
 */
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env['VITE_USER_POOL_ID'] ?? '',
      userPoolClientId: import.meta.env['VITE_USER_POOL_CLIENT_ID'] ?? '',
      signUpVerificationMethod: 'code',
      loginWith: { phone: true, email: true },
    },
  },
});

export interface AuthUser {
  userId: string;
  phone?: string;
  email?: string;
  roles: string[];
  orgIds: string[];
}

interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  isPartner: boolean;
  startPhoneSignIn: (phone: string) => Promise<SignInOutput>;
  confirmOtp: (code: string) => Promise<void>;
  register: (phone: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

/** Reads roles and org membership from the verified ID token, never from state. */
async function loadUser(): Promise<AuthUser | null> {
  try {
    const current = await getCurrentUser();
    const session = await fetchAuthSession();
    const claims = session.tokens?.idToken?.payload ?? {};

    const rawGroups = claims['cognito:groups'];
    const roles = Array.isArray(rawGroups) ? rawGroups.map(String) : [];

    const rawOrgs = claims['custom:orgIds'];
    const orgIds = typeof rawOrgs === 'string' && rawOrgs ? rawOrgs.split(',').filter(Boolean) : [];

    return {
      userId: current.userId,
      phone: claims['phone_number'] ? String(claims['phone_number']) : undefined,
      email: claims['email'] ? String(claims['email']) : undefined,
      roles: roles.length > 0 ? roles : ['guest'],
      orgIds,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setUser(await loadUser());
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const startPhoneSignIn = useCallback(async (phone: string) => {
    // Custom auth flow delivers a one-time code by SMS — no password to forget.
    return signIn({ username: phone, options: { authFlowType: 'CUSTOM_WITHOUT_SRP' } });
  }, []);

  const confirmOtp = useCallback(
    async (code: string) => {
      await confirmSignIn({ challengeResponse: code });
      await refresh();
    },
    [refresh],
  );

  const register = useCallback(async (phone: string, password: string, fullName: string) => {
    await signUp({
      username: phone,
      password,
      options: { userAttributes: { phone_number: phone, name: fullName } },
    });
  }, []);

  const signOut = useCallback(async () => {
    await amplifySignOut();
    setUser(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isPartner: Boolean(user?.roles.some((r) => r === 'partner_owner' || r === 'partner_staff')),
      startPhoneSignIn,
      confirmOtp,
      register,
      signOut,
      refresh,
    }),
    [user, loading, startPhoneSignIn, confirmOtp, register, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
