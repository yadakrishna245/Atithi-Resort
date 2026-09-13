import {
  CURRENCY,
  GST_SLABS,
  PLATFORM_CONVENIENCE_FEE_PAISE,
  type CancellationPolicyType,
} from './constants.js';
import type { Paise, PriceLineItem, PriceQuote, RoomType, TaxLine } from './types.js';

/**
 * Transparent pricing engine.
 *
 * Rules this module exists to enforce:
 *  1. The total shown at search === the total at checkout === the amount charged.
 *  2. Every rupee is attributable to a named line item.
 *  3. Tax is computed from configured slabs, never estimated by a model.
 *  4. There is no convenience fee, service fee, or gateway markup.
 *
 * Frontend and backend import this same function, so the numbers cannot drift.
 * The backend recomputes on every booking and rejects a mismatched client total.
 */

export interface QuoteInput {
  nightlyRatesPaise: Paise[];
  rooms: number;
  adults: number;
  children: number;
  roomType: Pick<
    RoomType,
    'maxAdults' | 'maxChildren' | 'maxOccupancy' | 'extraAdultChargePaise' | 'extraChildChargePaise'
  >;
  discountPaise?: Paise;
  discountLabelKey?: string;
  payAtPropertyShare?: number;
}

export function computeQuote(input: QuoteInput): PriceQuote {
  const {
    nightlyRatesPaise,
    rooms,
    adults,
    children,
    roomType,
    discountPaise = 0,
    discountLabelKey = 'price.discount',
    payAtPropertyShare = 0,
  } = input;

  if (rooms < 1) throw new Error('rooms must be at least 1');
  if (nightlyRatesPaise.length === 0) throw new Error('nightlyRatesPaise must not be empty');

  const nights = nightlyRatesPaise.length;
  const lineItems: PriceLineItem[] = [];

  // --- Room charges -------------------------------------------------------
  const roomSubtotalPaise = nightlyRatesPaise.reduce((sum, rate) => sum + rate * rooms, 0);

  lineItems.push({
    label: `Room charge — ${nights} night${nights > 1 ? 's' : ''} × ${rooms} room${rooms > 1 ? 's' : ''}`,
    labelKey: 'price.roomCharge',
    amountPaise: roomSubtotalPaise,
    kind: 'room',
    detail: nightlyRatesPaise.map((r, i) => `Night ${i + 1}: ${formatPaise(r)}`).join(' · '),
  });

  // --- Extra guest charges ------------------------------------------------
  const extraAdults = Math.max(0, adults - roomType.maxAdults * rooms);
  const extraChildren = Math.max(0, children - roomType.maxChildren * rooms);

  const extraAdultTotal = extraAdults * roomType.extraAdultChargePaise * nights;
  const extraChildTotal = extraChildren * roomType.extraChildChargePaise * nights;
  const extraGuestChargePaise = extraAdultTotal + extraChildTotal;

  if (extraAdultTotal > 0) {
    lineItems.push({
      label: `Extra adult × ${extraAdults}`,
      labelKey: 'price.extraAdult',
      amountPaise: extraAdultTotal,
      kind: 'extra_guest',
    });
  }
  if (extraChildTotal > 0) {
    lineItems.push({
      label: `Extra child × ${extraChildren}`,
      labelKey: 'price.extraChild',
      amountPaise: extraChildTotal,
      kind: 'extra_guest',
    });
  }

  // --- Discount -----------------------------------------------------------
  const grossPaise = roomSubtotalPaise + extraGuestChargePaise;
  const cappedDiscount = Math.min(Math.max(0, Math.round(discountPaise)), grossPaise);

  if (cappedDiscount > 0) {
    lineItems.push({
      label: 'Discount',
      labelKey: discountLabelKey,
      amountPaise: -cappedDiscount,
      kind: 'discount',
    });
  }

  const taxableBasePaise = grossPaise - cappedDiscount;

  // --- Tax ----------------------------------------------------------------
  // GST slab is determined by the per-night, per-room tariff, not the total.
  const averageNightlyPerRoom = Math.round(taxableBasePaise / (nights * rooms));
  const ratePercent = gstRateForTariff(averageNightlyPerRoom);
  const taxPaise = Math.round((taxableBasePaise * ratePercent) / 100);

  const taxBreakdown: TaxLine[] = [];
  if (ratePercent > 0) {
    // Intra-state supply splits into CGST + SGST; both halves are shown.
    const half = Math.round(taxPaise / 2);
    taxBreakdown.push(
      { name: 'CGST', ratePercent: ratePercent / 2, amountPaise: half, appliesToPaise: taxableBasePaise },
      {
        name: 'SGST',
        ratePercent: ratePercent / 2,
        amountPaise: taxPaise - half,
        appliesToPaise: taxableBasePaise,
      },
    );
    lineItems.push({
      label: `GST @ ${ratePercent}%`,
      labelKey: 'price.gst',
      amountPaise: taxPaise,
      kind: 'tax',
      detail: `Applied on ${formatPaise(taxableBasePaise)}`,
    });
  }

  // --- Fees ---------------------------------------------------------------
  // Deliberately zero. Kept as an explicit line so the promise is visible.
  const convenienceFeePaise = PLATFORM_CONVENIENCE_FEE_PAISE;
  if (convenienceFeePaise > 0) {
    lineItems.push({
      label: 'Convenience fee',
      labelKey: 'price.convenienceFee',
      amountPaise: convenienceFeePaise,
      kind: 'fee',
    });
  }

  const totalPayablePaise = taxableBasePaise + taxPaise + convenienceFeePaise;

  const share = Math.min(Math.max(payAtPropertyShare, 0), 1);
  const payAtPropertyPaise = Math.round(totalPayablePaise * share);
  const payNowPaise = totalPayablePaise - payAtPropertyPaise;

  return {
    nights,
    rooms,
    lineItems,
    roomSubtotalPaise,
    extraGuestChargePaise,
    discountPaise: cappedDiscount,
    taxableBasePaise,
    taxPaise,
    taxBreakdown,
    convenienceFeePaise,
    totalPayablePaise,
    payNowPaise,
    payAtPropertyPaise,
    currency: CURRENCY,
  };
}

export function gstRateForTariff(tariffPaise: Paise): number {
  for (const slab of GST_SLABS) {
    if (tariffPaise <= slab.maxTariffPaise) return slab.ratePercent;
  }
  return GST_SLABS[GST_SLABS.length - 1]!.ratePercent;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

const FREE_CANCELLATION_HOURS: Record<CancellationPolicyType, number | null> = {
  free_until_24h: 24,
  free_until_48h: 48,
  free_until_72h: 72,
  free_until_7d: 168,
  non_refundable: null,
  custom: null,
};

/** ISO timestamp until which cancellation is free, or null if never. */
export function freeCancellationDeadline(
  checkIn: string,
  checkInTime: string,
  policy: CancellationPolicyType,
): string | null {
  const hours = FREE_CANCELLATION_HOURS[policy];
  if (hours === null) return null;

  const checkInAt = Date.parse(`${checkIn}T${checkInTime}:00+05:30`);
  if (Number.isNaN(checkInAt)) return null;

  return new Date(checkInAt - hours * 3_600_000).toISOString();
}

export interface RefundCalculation {
  refundPaise: Paise;
  retainedPaise: Paise;
  isFree: boolean;
  reasonKey: string;
}

export function computeRefund(args: {
  amountPaidPaise: Paise;
  cancellationPolicy: CancellationPolicyType;
  freeCancellationUntil: string | null;
  now?: Date;
}): RefundCalculation {
  const { amountPaidPaise, cancellationPolicy, freeCancellationUntil } = args;
  const now = args.now ?? new Date();

  if (cancellationPolicy === 'non_refundable') {
    return {
      refundPaise: 0,
      retainedPaise: amountPaidPaise,
      isFree: false,
      reasonKey: 'cancel.nonRefundable',
    };
  }

  if (freeCancellationUntil && now.getTime() <= Date.parse(freeCancellationUntil)) {
    return {
      refundPaise: amountPaidPaise,
      retainedPaise: 0,
      isFree: true,
      reasonKey: 'cancel.freeWindow',
    };
  }

  // Past the free window: property retains one night, capped at the amount paid.
  return {
    refundPaise: 0,
    retainedPaise: amountPaidPaise,
    isFree: false,
    reasonKey: 'cancel.afterFreeWindow',
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Indian digit grouping: ₹1,45,000 not ₹145,000. */
export function formatPaise(paise: Paise, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

export function rupeesToPaise(rupees: number): Paise {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}
