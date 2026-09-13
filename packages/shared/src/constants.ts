/**
 * Platform constants.
 *
 * Anything in here that has a legal or financial consequence (GST slabs,
 * cancellation windows) is a CONFIGURED VALUE that must be verified with a
 * qualified advisor before going live. It is never inferred by a model.
 */

// ---------------------------------------------------------------------------
// Languages — full Indian language support is a first-class requirement
// ---------------------------------------------------------------------------

export const SUPPORTED_LOCALES = [
  'en', // English (India)
  'hi', // हिन्दी
  'ta', // தமிழ்
  'te', // తెలుగు
  'kn', // ಕನ್ನಡ
  'ml', // മലയാളം
  'mr', // मराठी
  'bn', // বাংলা
  'gu', // ગુજરાતી
  'pa', // ਪੰਜਾਬੀ
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: 'English', english: 'English' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
  ta: { native: 'தமிழ்', english: 'Tamil' },
  te: { native: 'తెలుగు', english: 'Telugu' },
  kn: { native: 'ಕನ್ನಡ', english: 'Kannada' },
  ml: { native: 'മലയാളം', english: 'Malayalam' },
  mr: { native: 'मराठी', english: 'Marathi' },
  bn: { native: 'বাংলা', english: 'Bengali' },
  gu: { native: 'ગુજરાતી', english: 'Gujarati' },
  pa: { native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
};

export const DEFAULT_LOCALE: Locale = 'en';

// ---------------------------------------------------------------------------
// Roles & access
// ---------------------------------------------------------------------------

export const ROLES = [
  'guest', // books stays; sees ONLY their own data
  'partner_staff', // property staff; sees only their org's data
  'partner_owner', // property owner; manages org
  'platform_support', // our support team; access is audited
  'platform_admin', // our engineers
] as const;

export type Role = (typeof ROLES)[number];

export const PARTNER_ROLES: readonly Role[] = ['partner_staff', 'partner_owner'];
export const PLATFORM_ROLES: readonly Role[] = ['platform_support', 'platform_admin'];

// ---------------------------------------------------------------------------
// Property taxonomy
// ---------------------------------------------------------------------------

export const PROPERTY_TYPES = [
  'hotel',
  'resort',
  'homestay',
  'villa',
  'apartment',
  'guesthouse',
  'hostel',
  'houseboat',
  'farmstay',
  'heritage',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * Amenities are a closed enum on purpose.
 * Free-text amenities are how OTAs end up with "infinity pool" on a property
 * that has a bucket. Every amenity here must be verifiable from a photo or
 * document during onboarding.
 */
export const AMENITIES = [
  'wifi',
  'parking',
  'ac',
  'power_backup',
  'hot_water',
  'restaurant',
  'room_service',
  'pool',
  'gym',
  'spa',
  'bonfire',
  'kitchen',
  'laundry',
  'lift',
  'tv',
  'work_desk',
  'pet_friendly',
  'wheelchair_accessible',
  'doctor_on_call',
  'cctv',
  'security_24x7',
  'airport_transfer',
  'breakfast_included',
  'pure_veg_kitchen',
  'ev_charging',
  'caretaker_on_site',
] as const;

export type Amenity = (typeof AMENITIES)[number];

// ---------------------------------------------------------------------------
// Policy keys — the transparency layer that OTAs bury or omit
// ---------------------------------------------------------------------------

export const POLICY_KEYS = [
  'cancellation',
  'check_in_time',
  'check_out_time',
  'early_check_in',
  'late_check_out',
  'id_proof',
  'local_id_accepted', // ← real Indian pain point: "local IDs not allowed"
  'unmarried_couples', // ← most common cause of denied check-in in India
  'pets',
  'alcohol',
  'smoking',
  'extra_bed',
  'children',
  'visitors',
  'payment_at_property',
  'gst_invoice',
] as const;

export type PolicyKey = (typeof POLICY_KEYS)[number];

/**
 * Policies a guest is most often denied check-in over. We force partners to
 * answer these explicitly — "not specified" is not allowed on a live listing.
 */
export const MANDATORY_POLICY_KEYS: readonly PolicyKey[] = [
  'cancellation',
  'check_in_time',
  'check_out_time',
  'id_proof',
  'local_id_accepted',
  'unmarried_couples',
];

export const POLICY_STANCES = ['allowed', 'not_allowed', 'conditional', 'ask_property'] as const;
export type PolicyStance = (typeof POLICY_STANCES)[number];

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = [
  'pending_payment',
  'confirmed',
  'checked_in',
  'completed',
  'cancelled_by_guest',
  'cancelled_by_property',
  'no_show',
  'refunded',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_MODES = ['pay_now', 'pay_at_property', 'partial_advance'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const CANCELLATION_POLICY_TYPES = [
  'free_until_24h',
  'free_until_48h',
  'free_until_72h',
  'free_until_7d',
  'non_refundable',
  'custom',
] as const;

export type CancellationPolicyType = (typeof CANCELLATION_POLICY_TYPES)[number];

// ---------------------------------------------------------------------------
// Verification — the anti-fake-data backbone
// ---------------------------------------------------------------------------

export const VERIFICATION_STATUSES = [
  'draft', // partner is still filling it in
  'pending_review', // submitted, our ops team must verify documents
  'verified', // documents + photos checked — ONLY these appear in search
  'rejected',
  'suspended',
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/** Only verified, live properties are ever returned by public search. */
export const PUBLICLY_LISTABLE_STATUSES: readonly VerificationStatus[] = ['verified'];

// ---------------------------------------------------------------------------
// Taxes & fees
// ---------------------------------------------------------------------------

/**
 * GST slabs for hotel accommodation, applied on the per-night tariff.
 *
 * ⚠️ CONFIGURED VALUE — verify with a chartered accountant before launch and
 * update via environment config, not code. Rates change with GST Council
 * notifications. Never let a model decide a tax rate.
 */
export const GST_SLABS = [
  { maxTariffPaise: 100_000, ratePercent: 0 }, // up to ₹1,000/night
  { maxTariffPaise: 750_000, ratePercent: 12 }, // up to ₹7,500/night
  { maxTariffPaise: Number.MAX_SAFE_INTEGER, ratePercent: 18 },
] as const;

/**
 * Our differentiator: zero convenience fee, zero "service fee", zero
 * payment-gateway markup passed to the guest. The price you see is the price
 * you pay. This constant exists so the promise is enforced in code.
 */
export const PLATFORM_CONVENIENCE_FEE_PAISE = 0;

export const CURRENCY = 'INR';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export const LIMITS = {
  maxNightsPerBooking: 30,
  maxRoomsPerBooking: 10,
  maxGuestsPerRoom: 6,
  maxSearchResults: 50,
  maxPhotosPerProperty: 40,
  minPhotosForVerification: 6,
  maxReviewLength: 2000,
  bookingHoldMinutes: 15,
} as const;

// ---------------------------------------------------------------------------
// Lead / AI receptionist (ties into docs/09)
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = [
  'new',
  'contacted',
  'attempted',
  'quoted',
  'nurture',
  'won',
  'lost',
  'escalated',
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const CALL_INTENTS = [
  'booking_enquiry',
  'existing_booking',
  'in_house_request',
  'complaint',
  'emergency',
  'general_info',
  'event_enquiry',
  'vendor_supplier',
  'job_enquiry',
  'spam_telemarketing',
  'wrong_number',
  'unclear',
] as const;

export type CallIntent = (typeof CALL_INTENTS)[number];
