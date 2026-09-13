import { describe, expect, it } from 'vitest';
import { detectViolation } from '../ai/groundedAssistant.js';

/**
 * Grounding guard suite.
 *
 * The user requirement was explicit: no fake or hallucinated data. This guard
 * is the deterministic backstop that runs on every AI answer, independently of
 * what the model was instructed to do — so it holds even under a successful
 * prompt injection.
 */

const FACTS = [
  'Property name: Coorg Mist Resort',
  'Check-in time: 14:00',
  'Policy - pets: allowed (garden cottages only, 500 cleaning charge)',
  'Published nightly rate range: ₹8,000 to ₹11,000 per night',
].join('\n');

describe('availability claims are blocked', () => {
  it('blocks a positive availability statement', () => {
    expect(detectViolation('Yes, rooms are available on the 24th.', FACTS)).toBe('availability_claim');
  });

  it('blocks a sold-out statement', () => {
    expect(detectViolation('We are fully booked that week.', FACTS)).toBe('availability_claim');
  });

  it('blocks "no rooms left"', () => {
    expect(detectViolation('Sorry, there are no rooms left.', FACTS)).toBe('availability_claim');
  });
});

describe('booking confirmations are blocked', () => {
  it('blocks a confirmation claim', () => {
    expect(detectViolation('Your booking is confirmed.', FACTS)).toBe('booking_confirmation');
  });

  it('blocks a first-person reservation claim', () => {
    expect(detectViolation('I have reserved the cottage for you.', FACTS)).toBe('booking_confirmation');
  });
});

describe('invented prices are blocked', () => {
  it('blocks a rupee figure absent from the facts', () => {
    expect(detectViolation('The rate is ₹6,500 per night.', FACTS)).toBe('unsourced_price');
  });

  it('blocks an "Rs." figure absent from the facts', () => {
    expect(detectViolation('It costs Rs. 4200 for two nights.', FACTS)).toBe('unsourced_price');
  });

  it('allows a figure that appears verbatim in the facts', () => {
    expect(detectViolation('Rates usually range from ₹8,000 to ₹11,000 a night.', FACTS)).toBeNull();
  });

  it('allows the pet cleaning charge because it is in the facts', () => {
    expect(detectViolation('Pets are allowed with a ₹500 cleaning charge.', FACTS)).toBeNull();
  });
});

describe('other prohibited outputs', () => {
  it('blocks a discount offer', () => {
    expect(detectViolation('I can give you 10% off.', FACTS)).toBe('discount_promise');
  });

  it('blocks a guarantee', () => {
    expect(detectViolation('I guarantee you will love it.', FACTS)).toBe('promise');
  });

  it('blocks solicitation of payment details', () => {
    expect(detectViolation('Please share your card number.', FACTS)).toBe('payment_solicitation');
  });
});

describe('legitimate grounded answers pass', () => {
  it('allows a policy answer drawn from the facts', () => {
    expect(detectViolation('Pets are welcome in our garden cottages.', FACTS)).toBeNull();
  });

  it('allows a check-in time answer', () => {
    expect(detectViolation('Check-in starts at 14:00.', FACTS)).toBeNull();
  });

  it('allows the deferral phrase', () => {
    expect(
      detectViolation("I don't have that detail on record. The property team will confirm it.", FACTS),
    ).toBeNull();
  });
});
