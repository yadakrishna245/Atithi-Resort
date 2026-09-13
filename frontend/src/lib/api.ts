import { fetchAuthSession } from 'aws-amplify/auth';
import type {
  AvailabilityResult,
  Booking,
  CreateBookingInput,
  GroundedAnswer,
  Property,
  Review,
  RoomType,
  SearchFilters,
  SearchResponse,
  UserProfile,
} from '@atithi/shared';

const BASE_URL = import.meta.env['VITE_API_BASE_URL'] ?? '';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Attaches the Cognito ID token when the user is signed in.
 *
 * The token is the sole basis for which data comes back — the client never
 * sends a user id or org id to identify itself, so it cannot ask for someone
 * else's records.
 */
async function authHeader(): Promise<Record<string, string>> {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`, window.location.origin);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
  };

  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(
      response.status,
      error.code ?? 'unknown_error',
      error.message ?? 'Something went wrong. Please try again.',
      error.details,
      error.requestId,
    );
  }

  return payload as T;
}

export const api = {
  // --- Public ---

  search: (filters: Partial<SearchFilters>, signal?: AbortSignal) =>
    request<SearchResponse>('/search', {
      query: filters as Record<string, string | number | boolean | undefined>,
      signal,
    }),

  naturalSearch: (query: string, locale: string) =>
    request<SearchResponse>('/search/natural', { method: 'POST', body: { query, locale } }),

  getProperty: (propertyId: string) =>
    request<{
      property: Property;
      roomTypes: RoomType[];
      reviews: Review[];
      reviewPolicy: string;
    }>(`/properties/${propertyId}`),

  getAvailability: (
    propertyId: string,
    params: { checkIn: string; checkOut: string; adults: number; children: number; rooms: number },
  ) => request<AvailabilityResult>(`/properties/${propertyId}/availability`, { query: params }),

  askProperty: (propertyId: string, question: string, locale: string) =>
    request<GroundedAnswer>(`/properties/${propertyId}/ask`, {
      method: 'POST',
      body: { question, locale },
    }),

  // --- Guest ---

  createBooking: (input: CreateBookingInput, idempotencyKey: string) =>
    request<{ booking: Booking }>('/bookings', { method: 'POST', body: input, idempotencyKey }),

  listBookings: () => request<{ data: Booking[]; cursor?: string }>('/bookings'),

  getBooking: (bookingId: string) =>
    request<{ booking: Booking; property: Partial<Property> | null }>(`/bookings/${bookingId}`),

  cancelBooking: (bookingId: string, reason: string) =>
    request<{ booking: Booking; refund: { refundPaise: number; isFreeCancellation: boolean } }>(
      `/bookings/${bookingId}/cancel`,
      { method: 'POST', body: { reason } },
    ),

  getProfile: () => request<{ profile: UserProfile; roles: string[]; orgIds: string[] }>('/me'),

  updateProfile: (input: Partial<UserProfile>) =>
    request<{ profile: UserProfile }>('/me', { method: 'PATCH', body: input }),

  recordConsent: (purpose: string, granted: boolean, source: string) =>
    request<void>('/me/consents', { method: 'POST', body: { purpose, granted, source } }),

  exportMyData: () => request<Record<string, unknown>>('/me/export'),

  requestDeletion: () => request<{ accepted: boolean; message: string }>('/me/delete-request', { method: 'POST' }),

  // --- Partner ---

  partner: {
    listProperties: () => request<{ data: Property[]; notice?: string }>('/partner/properties'),

    listBookings: (params: { from?: string; to?: string } = {}) =>
      request<{ data: Booking[]; cursor?: string }>('/partner/bookings', { query: params }),

    getInventory: (propertyId: string, from: string, to: string) =>
      request<{ data: unknown[] }>(`/partner/properties/${propertyId}/inventory`, {
        query: { from, to },
      }),

    setInventory: (propertyId: string, body: unknown) =>
      request<{ daysWritten: number }>(`/partner/properties/${propertyId}/inventory`, {
        method: 'PUT',
        body,
      }),
  },
};

/** Stable key so a retried submit cannot create two bookings. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
