import type {
  Amenity,
  BookingStatus,
  CallIntent,
  CancellationPolicyType,
  LeadStatus,
  Locale,
  PaymentMode,
  PolicyKey,
  PolicyStance,
  PropertyType,
  Role,
  VerificationStatus,
} from './constants.js';

// ---------------------------------------------------------------------------
// Money — always integer paise. Never floats. ₹1,450.00 === 145000
// ---------------------------------------------------------------------------

export type Paise = number;

export interface Money {
  amountPaise: Paise;
  currency: 'INR';
}

// ---------------------------------------------------------------------------
// Identity & tenancy
// ---------------------------------------------------------------------------

/**
 * Derived from the verified Cognito JWT only. Never from a request body.
 * Every data-access call must be scoped by this.
 */
export interface Principal {
  userId: string;
  email?: string;
  phone?: string;
  roles: Role[];
  /** Partner organisations this user belongs to. Empty for pure guests. */
  orgIds: string[];
  locale: Locale;
}

export interface UserProfile {
  userId: string;
  fullName: string;
  email?: string;
  phone: string;
  locale: Locale;
  city?: string;
  /** Saved for faster checkout; the guest can delete it at any time. */
  address?: PostalAddress;
  dateOfBirth?: string;
  gender?: 'male' | 'female' | 'other' | 'undisclosed';
  /** Explicit, timestamped consent — required under DPDP. */
  consents: ConsentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRecord {
  purpose: 'whatsapp_updates' | 'sms_updates' | 'email_marketing' | 'personalisation';
  granted: boolean;
  grantedAt: string;
  source: 'signup' | 'checkout' | 'settings' | 'call';
}

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: 'IN';
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

// ---------------------------------------------------------------------------
// Organisation (property partner)
// ---------------------------------------------------------------------------

export interface Organization {
  orgId: string;
  name: string;
  ownerUserId: string;
  gstin?: string;
  panLast4?: string;
  billingEmail: string;
  supportPhone: string;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

export interface Property {
  propertyId: string;
  orgId: string;
  name: string;
  type: PropertyType;
  /** Short description authored by the partner. Never model-generated. */
  description: string;
  /** Machine translations, clearly flagged so the guest knows the source. */
  translations?: Partial<Record<Locale, PropertyTranslation>>;
  address: PostalAddress;
  geo: GeoPoint;
  /** Lowercased, hyphenated city used as the search partition key. */
  citySlug: string;
  landmarks: Landmark[];
  amenities: Amenity[];
  photos: PropertyPhoto[];
  policies: PropertyPolicy[];
  cancellationPolicy: CancellationPolicyType;
  cancellationPolicyText?: string;
  checkInTime: string;
  checkOutTime: string;
  totalRooms: number;
  /** Direct line to the property. Answered by the AI receptionist if missed. */
  contactPhone: string;
  aiReceptionistEnabled: boolean;
  languagesSpoken: Locale[];
  verificationStatus: VerificationStatus;
  verifiedAt?: string;
  /** Derived from verified-stay reviews only. Null until enough real reviews. */
  rating?: PropertyRating;
  /** Denormalised for search cards. Recomputed when inventory changes. */
  lowestNightlyRatePaise?: Paise;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyTranslation {
  name?: string;
  description?: string;
  machineTranslated: true;
  translatedAt: string;
}

export interface Landmark {
  name: string;
  distanceKm: number;
  type: 'airport' | 'railway' | 'bus_stand' | 'attraction' | 'city_centre' | 'hospital';
}

export interface PropertyPhoto {
  photoId: string;
  key: string;
  caption?: string;
  roomTypeId?: string;
  /** Anti-catfish: photo must be verified by ops during onboarding. */
  verified: boolean;
  capturedAt?: string;
  order: number;
}

export interface PropertyPolicy {
  key: PolicyKey;
  stance: PolicyStance;
  /** Guest-readable detail. Required when stance is 'conditional'. */
  detail?: string;
}

export interface PropertyRating {
  average: number;
  count: number;
  breakdown: {
    cleanliness: number;
    accuracy: number;
    location: number;
    staff: number;
    value: number;
  };
}

// ---------------------------------------------------------------------------
// Rooms & inventory — the source of truth for availability
// ---------------------------------------------------------------------------

export interface RoomType {
  roomTypeId: string;
  propertyId: string;
  name: string;
  description: string;
  maxAdults: number;
  maxChildren: number;
  maxOccupancy: number;
  bedConfiguration: string;
  sizeSqft?: number;
  amenities: Amenity[];
  photoIds: string[];
  extraAdultChargePaise: Paise;
  extraChildChargePaise: Paise;
  isActive: boolean;
}

/**
 * One record per room type per date. If a record does not exist, the room is
 * NOT bookable for that date. We never infer or extrapolate availability.
 */
export interface InventoryDay {
  propertyId: string;
  roomTypeId: string;
  /** YYYY-MM-DD */
  date: string;
  totalRooms: number;
  bookedRooms: number;
  baseRatePaise: Paise;
  minStayNights: number;
  closed: boolean;
  updatedAt: string;
}

export interface AvailabilityResult {
  propertyId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  options: AvailabilityOption[];
  /** Dates within the range that have no inventory record at all. */
  unpricedDates: string[];
}

export interface AvailabilityOption {
  roomType: RoomType;
  roomsAvailable: number;
  nightlyRates: Array<{ date: string; ratePaise: Paise }>;
  quote: PriceQuote;
}

// ---------------------------------------------------------------------------
// Pricing — fully itemised, no hidden fees
// ---------------------------------------------------------------------------

export interface PriceQuote {
  nights: number;
  rooms: number;
  lineItems: PriceLineItem[];
  roomSubtotalPaise: Paise;
  extraGuestChargePaise: Paise;
  discountPaise: Paise;
  taxableBasePaise: Paise;
  taxPaise: Paise;
  taxBreakdown: TaxLine[];
  convenienceFeePaise: Paise;
  /** What the guest actually pays. Nothing is added after this. */
  totalPayablePaise: Paise;
  payNowPaise: Paise;
  payAtPropertyPaise: Paise;
  currency: 'INR';
}

export interface PriceLineItem {
  label: string;
  labelKey: string;
  amountPaise: Paise;
  kind: 'room' | 'extra_guest' | 'discount' | 'tax' | 'fee';
  detail?: string;
}

export interface TaxLine {
  name: string;
  ratePercent: number;
  amountPaise: Paise;
  appliesToPaise: Paise;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearchFilters {
  citySlug?: string;
  checkIn?: string;
  checkOut?: string;
  adults: number;
  children: number;
  rooms: number;
  propertyTypes?: PropertyType[];
  amenities?: Amenity[];
  minPricePaise?: Paise;
  maxPricePaise?: Paise;
  minRating?: number;
  /** Guests are routinely denied check-in over these. Filterable, verified. */
  requireCoupleFriendly?: boolean;
  requireLocalIdAccepted?: boolean;
  requirePetFriendly?: boolean;
  requireWheelchairAccessible?: boolean;
  requirePureVegKitchen?: boolean;
  requireFreeCancellation?: boolean;
  requirePayAtProperty?: boolean;
  sort?: 'recommended' | 'price_low' | 'price_high' | 'rating' | 'distance';
  cursor?: string;
  limit?: number;
}

export interface SearchResultItem {
  property: Property;
  /** Present only when dates were supplied and real inventory exists. */
  availability?: {
    lowestOption: AvailabilityOption;
    roomsLeft: number;
  };
  /** Why this property matched — shown to the guest, never a black box. */
  matchReasons: string[];
  distanceKm?: number;
}

export interface SearchResponse {
  items: SearchResultItem[];
  cursor?: string;
  total: number;
  /** Set when the query was parsed by AI, so the UI can show what it understood. */
  interpretedQuery?: InterpretedQuery;
}

export interface InterpretedQuery {
  originalText: string;
  filters: SearchFilters;
  /** Terms the parser could not map to a known city/amenity — surfaced, not guessed. */
  unresolvedTerms: string[];
  confidence: number;
  /** True when the AI parser was unavailable and a plain fallback was used. */
  degraded: boolean;
}

// ---------------------------------------------------------------------------
// Booking — includes every guest detail the business needs
// ---------------------------------------------------------------------------

export interface Booking {
  bookingId: string;
  /** Human-readable reference shown to the guest, e.g. ATH-8H3K2M */
  reference: string;
  userId: string;
  propertyId: string;
  orgId: string;
  roomTypeId: string;

  checkIn: string;
  checkOut: string;
  nights: number;
  rooms: number;

  /** Primary contact — the person responsible for the booking. */
  primaryGuest: GuestDetails;
  /** Every person staying. Indian properties require this at check-in. */
  members: GuestMember[];
  adults: number;
  children: number;

  /** Where the guest is travelling from — used for logistics, not resold. */
  originCity?: string;
  purposeOfVisit?: 'leisure' | 'business' | 'family' | 'wedding' | 'medical' | 'pilgrimage' | 'other';
  specialRequests?: string;
  estimatedArrivalTime?: string;

  quote: PriceQuote;
  paymentMode: PaymentMode;
  status: BookingStatus;
  statusHistory: BookingStatusChange[];

  paymentRef?: string;
  amountPaidPaise: Paise;
  refundPaise: Paise;

  cancellationPolicy: CancellationPolicyType;
  freeCancellationUntil?: string;
  cancelledAt?: string;
  cancellationReason?: string;

  /** Set when the booking originated from an AI-answered missed call. */
  sourceLeadId?: string;
  source: 'web' | 'ai_call' | 'partner_manual' | 'whatsapp';

  locale: Locale;
  createdAt: string;
  updatedAt: string;
}

export interface GuestDetails {
  fullName: string;
  phone: string;
  email?: string;
  address?: PostalAddress;
  /** ID type only — we never store the number itself. */
  idProofType?: 'aadhaar' | 'passport' | 'driving_licence' | 'voter_id' | 'other';
}

export interface GuestMember {
  fullName: string;
  ageYears: number;
  relationToPrimary?: string;
  isChild: boolean;
}

export interface BookingStatusChange {
  from: BookingStatus | null;
  to: BookingStatus;
  at: string;
  by: 'guest' | 'partner' | 'system' | 'support';
  note?: string;
}

// ---------------------------------------------------------------------------
// Reviews — only from completed, verified stays
// ---------------------------------------------------------------------------

export interface Review {
  reviewId: string;
  propertyId: string;
  /** Enforced server-side: the booking must exist, belong to this user, and be completed. */
  bookingId: string;
  userId: string;
  displayName: string;
  ratings: {
    overall: number;
    cleanliness: number;
    accuracy: number;
    location: number;
    staff: number;
    value: number;
  };
  title?: string;
  body: string;
  locale: Locale;
  stayedOn: string;
  /** True for every review on this platform — there is no other way to post one. */
  verifiedStay: true;
  partnerResponse?: { body: string; respondedAt: string };
  createdAt: string;
}

// ---------------------------------------------------------------------------
// AI receptionist leads (bridges the voice product into the booking platform)
// ---------------------------------------------------------------------------

export interface Lead {
  leadId: string;
  orgId: string;
  propertyId: string;
  callId?: string;
  guestName?: string;
  guestPhone: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  roomTypeInterest?: string;
  budgetMinPaise?: Paise;
  budgetMaxPaise?: Paise;
  intent: CallIntent;
  summary: string;
  transcriptRef?: string;
  locale: Locale;
  status: LeadStatus;
  priority: 'hot' | 'warm' | 'cold';
  slaDueAt: string;
  firstContactedAt?: string;
  assignedToUserId?: string;
  convertedBookingId?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Grounded AI responses
// ---------------------------------------------------------------------------

/**
 * Every AI answer carries its provenance. If `grounded` is false the UI must
 * show a "we'll confirm with the property" state instead of the text.
 */
export interface GroundedAnswer {
  answer: string;
  grounded: boolean;
  sources: Array<{ field: string; value: string }>;
  confidence: number;
  locale: Locale;
}

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface Paginated<T> {
  data: T[];
  cursor?: string;
}
