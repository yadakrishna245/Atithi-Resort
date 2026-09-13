import { z } from 'zod';
import {
  AMENITIES,
  BOOKING_STATUSES,
  CANCELLATION_POLICY_TYPES,
  LIMITS,
  PAYMENT_MODES,
  POLICY_KEYS,
  POLICY_STANCES,
  PROPERTY_TYPES,
  SUPPORTED_LOCALES,
} from './constants.js';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Indian mobile in E.164. Rejects the common 0-prefixed / 11-digit mistakes. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+91[6-9]\d{9}$/, 'Enter a valid Indian mobile number, e.g. +919876543210');

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(d)), 'Invalid calendar date');

export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const paiseSchema = z.number().int().nonnegative();

export const pincodeSchema = z
  .string()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

export const addressSchema = z.object({
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().min(2).max(60),
  pincode: pincodeSchema,
  country: z.literal('IN'),
});

export const geoSchema = z.object({
  lat: z.number().min(6).max(37.5), // India bounding box — rejects bad geocodes
  lng: z.number().min(68).max(97.5),
});

// ---------------------------------------------------------------------------
// Date-range rule shared by search, availability and booking
// ---------------------------------------------------------------------------

export const dateRangeSchema = z
  .object({ checkIn: isoDateSchema, checkOut: isoDateSchema })
  .refine((v) => v.checkOut > v.checkIn, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  })
  .refine((v) => nightsBetween(v.checkIn, v.checkOut) <= LIMITS.maxNightsPerBooking, {
    message: `Maximum stay is ${LIMITS.maxNightsPerBooking} nights`,
    path: ['checkOut'],
  });

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchFiltersSchema = z
  .object({
    citySlug: z.string().trim().toLowerCase().max(60).optional(),
    checkIn: isoDateSchema.optional(),
    checkOut: isoDateSchema.optional(),
    adults: z.coerce.number().int().min(1).max(30).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
    rooms: z.coerce.number().int().min(1).max(LIMITS.maxRoomsPerBooking).default(1),
    propertyTypes: z.array(z.enum(PROPERTY_TYPES)).max(10).optional(),
    amenities: z.array(z.enum(AMENITIES)).max(20).optional(),
    minPricePaise: paiseSchema.optional(),
    maxPricePaise: paiseSchema.optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    requireCoupleFriendly: z.coerce.boolean().optional(),
    requireLocalIdAccepted: z.coerce.boolean().optional(),
    requirePetFriendly: z.coerce.boolean().optional(),
    requireWheelchairAccessible: z.coerce.boolean().optional(),
    requirePureVegKitchen: z.coerce.boolean().optional(),
    requireFreeCancellation: z.coerce.boolean().optional(),
    requirePayAtProperty: z.coerce.boolean().optional(),
    sort: z.enum(['recommended', 'price_low', 'price_high', 'rating', 'distance']).default('recommended'),
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(LIMITS.maxSearchResults).default(20),
  })
  // Without this a reversed range silently returns zero results, which reads as
  // "nothing available" rather than "you typed the dates backwards".
  .refine((v) => !v.checkIn || !v.checkOut || v.checkOut > v.checkIn, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  })
  .refine(
    (v) => !v.checkIn || !v.checkOut || nightsBetween(v.checkIn, v.checkOut) <= LIMITS.maxNightsPerBooking,
    { message: `Maximum stay is ${LIMITS.maxNightsPerBooking} nights`, path: ['checkOut'] },
  );

export const naturalSearchSchema = z.object({
  query: z.string().trim().min(3).max(300),
  locale: localeSchema.default('en'),
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const availabilityQuerySchema = z
  .object({
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    adults: z.coerce.number().int().min(1).max(30).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
    rooms: z.coerce.number().int().min(1).max(LIMITS.maxRoomsPerBooking).default(1),
  })
  .refine((v) => v.checkOut > v.checkIn, { message: 'Check-out must be after check-in' })
  .refine((v) => nightsBetween(v.checkIn, v.checkOut) <= LIMITS.maxNightsPerBooking, {
    message: `Maximum stay is ${LIMITS.maxNightsPerBooking} nights`,
  });

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const guestDetailsSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: z.string().trim().email().max(120).optional(),
  address: addressSchema.optional(),
  idProofType: z.enum(['aadhaar', 'passport', 'driving_licence', 'voter_id', 'other']).optional(),
});

export const guestMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  ageYears: z.number().int().min(0).max(120),
  relationToPrimary: z.string().trim().max(40).optional(),
  isChild: z.boolean(),
});

export const createBookingSchema = z
  .object({
    propertyId: z.string().uuid(),
    roomTypeId: z.string().uuid(),
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    rooms: z.number().int().min(1).max(LIMITS.maxRoomsPerBooking),
    adults: z.number().int().min(1).max(30),
    children: z.number().int().min(0).max(20),
    primaryGuest: guestDetailsSchema,
    members: z.array(guestMemberSchema).max(50).default([]),
    originCity: z.string().trim().max(60).optional(),
    purposeOfVisit: z
      .enum(['leisure', 'business', 'family', 'wedding', 'medical', 'pilgrimage', 'other'])
      .optional(),
    specialRequests: z.string().trim().max(1000).optional(),
    estimatedArrivalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM')
      .optional(),
    paymentMode: z.enum(PAYMENT_MODES),
    locale: localeSchema.default('en'),
    /** Client echoes the quote it displayed; server recomputes and rejects drift. */
    expectedTotalPaise: paiseSchema,
  })
  .refine((v) => v.checkOut > v.checkIn, {
    message: 'Check-out must be after check-in',
    path: ['checkOut'],
  })
  .refine((v) => v.adults + v.children <= v.rooms * LIMITS.maxGuestsPerRoom, {
    message: 'Too many guests for the number of rooms selected',
    path: ['rooms'],
  })
  .refine((v) => v.members.length === 0 || v.members.length === v.adults + v.children, {
    message: 'Member list must cover every guest, or be left empty',
    path: ['members'],
  });

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const bookingStatusUpdateSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  note: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(80).optional(),
  email: z.string().trim().email().max(120).optional(),
  locale: localeSchema.optional(),
  city: z.string().trim().max(60).optional(),
  address: addressSchema.optional(),
  gender: z.enum(['male', 'female', 'other', 'undisclosed']).optional(),
});

export const consentSchema = z.object({
  purpose: z.enum(['whatsapp_updates', 'sms_updates', 'email_marketing', 'personalisation']),
  granted: z.boolean(),
  source: z.enum(['signup', 'checkout', 'settings', 'call']),
});

// ---------------------------------------------------------------------------
// Partner: property authoring
// ---------------------------------------------------------------------------

export const policySchema = z
  .object({
    key: z.enum(POLICY_KEYS),
    stance: z.enum(POLICY_STANCES),
    detail: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.stance !== 'conditional' || (v.detail && v.detail.length > 0), {
    message: 'Explain the condition so guests are not surprised at check-in',
    path: ['detail'],
  });

export const upsertPropertySchema = z.object({
  name: z.string().trim().min(3).max(120),
  type: z.enum(PROPERTY_TYPES),
  description: z.string().trim().min(50).max(4000),
  address: addressSchema,
  geo: geoSchema,
  landmarks: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(80),
        distanceKm: z.number().min(0).max(500),
        type: z.enum(['airport', 'railway', 'bus_stand', 'attraction', 'city_centre', 'hospital']),
      }),
    )
    .max(15)
    .default([]),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
  policies: z.array(policySchema).max(POLICY_KEYS.length).default([]),
  cancellationPolicy: z.enum(CANCELLATION_POLICY_TYPES),
  cancellationPolicyText: z.string().trim().max(1000).optional(),
  checkInTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  checkOutTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  totalRooms: z.number().int().min(1).max(2000),
  contactPhone: phoneSchema,
  aiReceptionistEnabled: z.boolean().default(false),
  languagesSpoken: z.array(localeSchema).min(1).max(SUPPORTED_LOCALES.length),
});

export const upsertRoomTypeSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(1500),
  maxAdults: z.number().int().min(1).max(LIMITS.maxGuestsPerRoom),
  maxChildren: z.number().int().min(0).max(LIMITS.maxGuestsPerRoom),
  maxOccupancy: z.number().int().min(1).max(LIMITS.maxGuestsPerRoom),
  bedConfiguration: z.string().trim().min(2).max(80),
  sizeSqft: z.number().int().min(50).max(10_000).optional(),
  amenities: z.array(z.enum(AMENITIES)).max(AMENITIES.length).default([]),
  extraAdultChargePaise: paiseSchema.default(0),
  extraChildChargePaise: paiseSchema.default(0),
  isActive: z.boolean().default(true),
});

/** Inventory is the single source of truth for availability — never inferred. */
export const setInventorySchema = z.object({
  roomTypeId: z.string().uuid(),
  from: isoDateSchema,
  to: isoDateSchema,
  totalRooms: z.number().int().min(0).max(2000),
  baseRatePaise: paiseSchema,
  minStayNights: z.number().int().min(1).max(30).default(1),
  closed: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

const ratingValue = z.number().int().min(1).max(5);

export const createReviewSchema = z.object({
  bookingId: z.string().uuid(),
  ratings: z.object({
    overall: ratingValue,
    cleanliness: ratingValue,
    accuracy: ratingValue,
    location: ratingValue,
    staff: ratingValue,
    value: ratingValue,
  }),
  title: z.string().trim().max(120).optional(),
  body: z.string().trim().min(20).max(LIMITS.maxReviewLength),
  locale: localeSchema.default('en'),
});

// ---------------------------------------------------------------------------
// Grounded property Q&A
// ---------------------------------------------------------------------------

export const propertyQuestionSchema = z.object({
  question: z.string().trim().min(3).max(300),
  locale: localeSchema.default('en'),
});

// ---------------------------------------------------------------------------
// Leads (AI receptionist)
// ---------------------------------------------------------------------------

export const updateLeadSchema = z.object({
  status: z
    .enum(['new', 'contacted', 'attempted', 'quoted', 'nurture', 'won', 'lost', 'escalated'])
    .optional(),
  assignedToUserId: z.string().optional(),
  note: z.string().trim().max(1000).optional(),
  convertedBookingId: z.string().uuid().optional(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type SearchFiltersInput = z.infer<typeof searchFiltersSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type UpsertPropertyInput = z.infer<typeof upsertPropertySchema>;
export type UpsertRoomTypeInput = z.infer<typeof upsertRoomTypeSchema>;
export type SetInventoryInput = z.infer<typeof setInventorySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
