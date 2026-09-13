import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AvailabilityOption, PolicyStance } from '@atithi/shared';
import { api } from '../lib/api';
import { useI18n, useMoney } from '../i18n';
import PriceBreakdown from '../components/PriceBreakdown';
import type { TranslationKey } from '../i18n/translations';

const STANCE_STYLE: Record<PolicyStance, string> = {
  allowed: 'badge-verified',
  not_allowed: 'badge bg-rose-50 text-rose-800',
  conditional: 'badge-warn',
  ask_property: 'badge-info',
};

export default function PropertyPage() {
  const { propertyId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const money = useMoney();

  const checkIn = params.get('checkIn') ?? '';
  const checkOut = params.get('checkOut') ?? '';
  const adults = Number(params.get('adults') ?? 2);
  const children = Number(params.get('children') ?? 0);
  const rooms = Number(params.get('rooms') ?? 1);

  const propertyQuery = useQuery({
    queryKey: ['property', propertyId],
    queryFn: () => api.getProperty(propertyId),
  });

  const availabilityQuery = useQuery({
    queryKey: ['availability', propertyId, checkIn, checkOut, adults, children, rooms],
    queryFn: () => api.getAvailability(propertyId, { checkIn, checkOut, adults, children, rooms }),
    enabled: Boolean(checkIn && checkOut),
  });

  const [question, setQuestion] = useState('');
  const ask = useMutation({
    mutationFn: () => api.askProperty(propertyId, question, locale),
  });

  if (propertyQuery.isLoading) return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  if (propertyQuery.isError || !propertyQuery.data)
    return <p className="text-sm text-rose-700">{t('common.error')}</p>;

  const { property, roomTypes, reviews } = propertyQuery.data;

  const selectRoom = (option: AvailabilityOption) => {
    navigate('/checkout', {
      state: {
        propertyId,
        propertyName: property.name,
        roomTypeId: option.roomType.roomTypeId,
        roomTypeName: option.roomType.name,
        checkIn,
        checkOut,
        adults,
        children,
        rooms,
        quote: option.quote,
      },
    });
  };

  return (
    <article className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">{property.name}</h1>
          <span className="badge-verified">{t('search.reason.verified')}</span>
        </div>
        <p className="mt-1 text-slate-600">
          {property.address.line1}, {property.address.city}, {property.address.state}{' '}
          {property.address.pincode}
        </p>
        {property.rating && (
          <p className="mt-2 text-sm">
            ★ <strong>{property.rating.average}</strong> · {property.rating.count}{' '}
            {t('property.reviews')} · <span className="text-emerald-700">{t('property.verifiedStay')}</span>
          </p>
        )}
      </header>

      {/* Direct line to the property — the thing OTAs deliberately hide */}
      <section className="card border-brand-200 bg-brand-50 p-4">
        <a href={`tel:${property.contactPhone}`} className="btn-primary">
          {t('property.callProperty')}
        </a>
        {property.aiReceptionistEnabled && (
          <p className="mt-2 text-sm text-brand-900">{t('property.callNote')}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('property.about')}</h2>
        <p className="whitespace-pre-line text-slate-700">{property.description}</p>
        {property.translations?.[locale]?.machineTranslated && (
          <p className="mt-2 text-xs text-slate-500">{t('property.machineTranslated')}</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('property.amenities')}</h2>
        <ul className="flex flex-wrap gap-2">
          {property.amenities.map((amenity) => (
            <li key={amenity} className="badge-info">
              {amenity.replace(/_/g, ' ')}
            </li>
          ))}
        </ul>
      </section>

      {/* House rules stated plainly and up front, not buried at the bottom */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('property.policies')}</h2>
        <ul className="space-y-2">
          {property.policies.map((policy) => (
            <li key={policy.key} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="min-w-40 font-medium text-slate-700">
                {policy.key.replace(/_/g, ' ')}
              </span>
              <span className={STANCE_STYLE[policy.stance]}>
                {t(`policy.${policy.stance}` as TranslationKey)}
              </span>
              {policy.detail && <span className="text-slate-600">{policy.detail}</span>}
            </li>
          ))}
        </ul>
      </section>

      {/* Rooms — shown only when real inventory covers every night */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('property.rooms')}</h2>

        {!checkIn || !checkOut ? (
          <p className="text-sm text-slate-600">{t('search.checkIn')} / {t('search.checkOut')} →</p>
        ) : availabilityQuery.isLoading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : availabilityQuery.data?.options.length ? (
          <ul className="space-y-4">
            {availabilityQuery.data.options.map((option) => (
              <li key={option.roomType.roomTypeId} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="font-semibold">{option.roomType.name}</h3>
                    <p className="text-sm text-slate-600">{option.roomType.description}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {option.roomType.bedConfiguration} · sleeps {option.roomType.maxOccupancy}
                    </p>
                    {option.roomsAvailable <= 3 && (
                      <p className="mt-1 text-xs text-amber-700">
                        {t('property.roomsLeft', { count: option.roomsAvailable })}
                      </p>
                    )}
                  </div>

                  <div className="w-full sm:w-64">
                    <PriceBreakdown quote={option.quote} />
                    <button
                      type="button"
                      onClick={() => selectRoom(option)}
                      className="btn-primary mt-3 w-full"
                    >
                      {t('property.selectRoom')} · {money(option.quote.totalPayablePaise)}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card p-4">
            <p className="text-sm text-slate-700">{t('search.noResults')}</p>
            {availabilityQuery.data && availabilityQuery.data.unpricedDates.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                No published rates for: {availabilityQuery.data.unpricedDates.join(', ')}
              </p>
            )}
          </div>
        )}

        {roomTypes.length > 0 && !checkIn && (
          <ul className="mt-3 space-y-2">
            {roomTypes.map((room) => (
              <li key={room.roomTypeId} className="card p-3 text-sm">
                <strong>{room.name}</strong> — {room.bedConfiguration}, sleeps {room.maxOccupancy}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Grounded Q&A — the answer states its own confidence */}
      <section className="card p-4">
        <h2 className="text-lg font-semibold">{t('property.askTitle')}</h2>
        <p className="mt-1 text-xs text-slate-500">{t('property.askNote')}</p>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim().length >= 3) ask.mutate();
          }}
          className="mt-3 flex gap-2"
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('property.askPlaceholder')}
            className="input flex-1"
            maxLength={300}
          />
          <button type="submit" className="btn-primary" disabled={ask.isPending}>
            {t('property.ask')}
          </button>
        </form>

        {ask.data && (
          <div
            className={`mt-3 rounded-lg p-3 text-sm ${
              ask.data.grounded ? 'bg-slate-50 text-slate-800' : 'bg-amber-50 text-amber-900'
            }`}
            aria-live="polite"
          >
            <p>{ask.data.answer}</p>
            {!ask.data.grounded && <p className="mt-1 text-xs">{t('property.notConfirmed')}</p>}
            {ask.data.grounded && ask.data.sources.length > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                Source: {ask.data.sources.map((s) => s.field).join(', ')}
              </p>
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('property.reviews')}</h2>
        {reviews.length === 0 ? (
          <p className="text-sm text-slate-600">{t('property.noReviewsYet')}</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.reviewId} className="card p-4">
                <div className="flex items-center gap-2">
                  <strong className="text-sm">{review.displayName}</strong>
                  <span className="badge-verified">{t('property.verifiedStay')}</span>
                  <span className="ml-auto text-sm">★ {review.ratings.overall}</span>
                </div>
                {review.title && <p className="mt-1 font-medium">{review.title}</p>}
                <p className="mt-1 text-sm text-slate-700">{review.body}</p>
                {review.partnerResponse && (
                  <p className="mt-2 border-l-2 border-slate-200 pl-3 text-sm text-slate-600">
                    {review.partnerResponse.body}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
