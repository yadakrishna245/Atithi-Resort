import { useMemo, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import type { GuestMember, PaymentMode, PriceQuote } from '@atithi/shared';
import { api, ApiError, newIdempotencyKey } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n';
import PriceBreakdown from '../components/PriceBreakdown';

interface CheckoutState {
  propertyId: string;
  propertyName: string;
  roomTypeId: string;
  roomTypeName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
  quote: PriceQuote;
}

export default function CheckoutPage() {
  const { state } = useLocation() as { state: CheckoutState | null };
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, locale } = useI18n();

  // Stable across retries so a double-submit cannot create two bookings.
  const idempotencyKey = useMemo(() => newIdempotencyKey(), []);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('');
  const [pincode, setPincode] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [purpose, setPurpose] = useState<'leisure' | 'business' | 'family' | 'wedding' | 'medical' | 'pilgrimage' | 'other'>('leisure');
  const [arrivalTime, setArrivalTime] = useState('');
  const [requests, setRequests] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('pay_at_property');
  const [whatsappConsent, setWhatsappConsent] = useState(false);

  const totalGuests = (state?.adults ?? 0) + (state?.children ?? 0);
  const [members, setMembers] = useState<GuestMember[]>([]);

  const booking = useMutation({
    mutationFn: async () => {
      if (!state) throw new Error('Missing checkout state');

      const result = await api.createBooking(
        {
          propertyId: state.propertyId,
          roomTypeId: state.roomTypeId,
          checkIn: state.checkIn,
          checkOut: state.checkOut,
          rooms: state.rooms,
          adults: state.adults,
          children: state.children,
          primaryGuest: {
            fullName,
            phone,
            ...(email ? { email } : {}),
            ...(line1 && city && stateName && pincode
              ? { address: { line1, city, state: stateName, pincode, country: 'IN' as const } }
              : {}),
          },
          members,
          ...(originCity ? { originCity } : {}),
          purposeOfVisit: purpose,
          ...(requests ? { specialRequests: requests } : {}),
          ...(arrivalTime ? { estimatedArrivalTime: arrivalTime } : {}),
          paymentMode,
          locale,
          // Server recomputes and rejects if this no longer matches.
          expectedTotalPaise: state.quote.totalPayablePaise,
        },
        idempotencyKey,
      );

      if (whatsappConsent) {
        await api.recordConsent('whatsapp_updates', true, 'checkout').catch(() => undefined);
      }

      return result;
    },
    onSuccess: () => navigate('/bookings', { replace: true }),
  });

  if (!state) return <Navigate to="/" replace />;

  const addMember = () =>
    setMembers((current) => [...current, { fullName: '', ageYears: 18, isChild: false }]);

  const updateMember = (index: number, patch: Partial<GuestMember>) =>
    setMembers((current) => current.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const errorMessage =
    booking.error instanceof ApiError
      ? booking.error.code === 'price_changed'
        ? t('checkout.priceChanged')
        : booking.error.code === 'inventory_unavailable'
          ? t('checkout.soldOut')
          : booking.error.message
      : booking.error
        ? t('common.error')
        : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        booking.mutate();
      }}
      className="grid gap-6 lg:grid-cols-[1fr_22rem]"
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t('checkout.title')}</h1>

        <section className="card p-4">
          <h2 className="font-semibold">{state.propertyName}</h2>
          <p className="text-sm text-slate-600">
            {state.roomTypeName} · {state.checkIn} → {state.checkOut} · {state.rooms}{' '}
            {t('search.rooms')} · {totalGuests} {t('search.guests')}
          </p>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 font-semibold">{t('checkout.guestDetails')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">{t('checkout.fullName')}</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required minLength={2} className="input" />
            </label>
            <label>
              <span className="label">{t('checkout.phone')}</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+919876543210"
                pattern="\+91[6-9][0-9]{9}"
                className="input"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="label">{t('checkout.email')}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </label>
          </div>

          <h3 className="mb-2 mt-4 text-sm font-medium text-slate-700">{t('checkout.address')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">{t('checkout.address')}</span>
              <input value={line1} onChange={(e) => setLine1(e.target.value)} className="input" />
            </label>
            <label>
              <span className="label">{t('checkout.city')}</span>
              <input value={city} onChange={(e) => setCity(e.target.value)} className="input" />
            </label>
            <label>
              <span className="label">{t('checkout.state')}</span>
              <input value={stateName} onChange={(e) => setStateName(e.target.value)} className="input" />
            </label>
            <label>
              <span className="label">{t('checkout.pincode')}</span>
              <input value={pincode} onChange={(e) => setPincode(e.target.value)} pattern="[1-9][0-9]{5}" className="input" />
            </label>
          </div>
        </section>

        {/* Every member captured now, because the property will ask at check-in */}
        <section className="card p-4">
          <h2 className="font-semibold">{t('checkout.members')}</h2>
          <p className="mt-1 text-xs text-slate-500">{t('checkout.membersNote')}</p>

          <ul className="mt-3 space-y-2">
            {members.map((member, index) => (
              <li key={index} className="grid gap-2 sm:grid-cols-[1fr_6rem_7rem]">
                <input
                  value={member.fullName}
                  onChange={(e) => updateMember(index, { fullName: e.target.value })}
                  placeholder={t('checkout.memberName')}
                  className="input"
                />
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={member.ageYears}
                  onChange={(e) =>
                    updateMember(index, {
                      ageYears: Number(e.target.value),
                      isChild: Number(e.target.value) < 12,
                    })
                  }
                  placeholder={t('checkout.memberAge')}
                  className="input"
                />
                <button
                  type="button"
                  onClick={() => setMembers((c) => c.filter((_, i) => i !== index))}
                  className="btn-secondary"
                >
                  {t('common.cancel')}
                </button>
              </li>
            ))}
          </ul>

          {members.length < totalGuests && (
            <button type="button" onClick={addMember} className="btn-secondary mt-3">
              {t('checkout.addMember')} ({members.length}/{totalGuests})
            </button>
          )}
        </section>

        <section className="card p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="label">{t('checkout.originCity')}</span>
              <input value={originCity} onChange={(e) => setOriginCity(e.target.value)} className="input" />
            </label>
            <label>
              <span className="label">{t('checkout.arrivalTime')}</span>
              <input type="time" value={arrivalTime} onChange={(e) => setArrivalTime(e.target.value)} className="input" />
            </label>
            <label>
              <span className="label">{t('checkout.purpose')}</span>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value as typeof purpose)} className="input">
                {['leisure', 'business', 'family', 'wedding', 'medical', 'pilgrimage', 'other'].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="label">{t('checkout.paymentMode')}</span>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                className="input"
              >
                <option value="pay_at_property">{t('price.payAtProperty')}</option>
                <option value="pay_now">{t('price.payNow')}</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="label">{t('checkout.requests')}</span>
              <textarea
                value={requests}
                onChange={(e) => setRequests(e.target.value)}
                rows={3}
                maxLength={1000}
                className="input"
              />
            </label>
          </div>

          <label className="mt-3 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={whatsappConsent}
              onChange={(e) => setWhatsappConsent(e.target.checked)}
              className="mt-1"
            />
            <span>{t('checkout.consentWhatsapp')}</span>
          </label>
        </section>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <PriceBreakdown quote={state.quote} defaultOpen />

        {errorMessage && (
          <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
            {errorMessage}
          </p>
        )}

        <button type="submit" className="btn-primary w-full" disabled={booking.isPending}>
          {booking.isPending ? t('checkout.confirming') : t('checkout.confirm')}
        </button>
      </aside>
    </form>
  );
}
