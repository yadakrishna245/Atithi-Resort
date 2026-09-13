import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import type { SearchResultItem } from '@atithi/shared';
import { api } from '../lib/api';
import { useI18n, useMoney } from '../i18n';
import type { TranslationKey } from '../i18n/translations';
import DestinationsStrip from '../components/DestinationsStrip';
import heroBg from '../assets/resort-hero.svg';

const TRUST_POINTS = [
  { emoji: '✅', text: 'Every listing is verified by our team before it goes live' },
  { emoji: '💬', text: 'Someone always answers — an AI receptionist backs up every property' },
  { emoji: '🇮🇳', text: 'Prices shown include all taxes, no surprise convenience fees' },
] as const;

const FILTER_TOGGLES = [
  { key: 'requireCoupleFriendly', label: 'filter.coupleFriendly' },
  { key: 'requireLocalIdAccepted', label: 'filter.localId' },
  { key: 'requirePetFriendly', label: 'filter.petFriendly' },
  { key: 'requireWheelchairAccessible', label: 'filter.wheelchair' },
  { key: 'requirePureVegKitchen', label: 'filter.pureVeg' },
  { key: 'requireFreeCancellation', label: 'filter.freeCancellation' },
  { key: 'requirePayAtProperty', label: 'filter.payAtProperty' },
] as const;

export default function SearchPage() {
  const { t, locale } = useI18n();
  const [params, setParams] = useSearchParams();
  const [naturalQuery, setNaturalQuery] = useState('');
  // Tracks which result set is authoritative — a stale natural-language
  // result must never linger on screen after the guest picks a destination
  // card or changes a plain filter.
  const [mode, setMode] = useState<'filters' | 'natural'>('filters');

  const filters = {
    citySlug: params.get('city') ?? undefined,
    checkIn: params.get('checkIn') ?? undefined,
    checkOut: params.get('checkOut') ?? undefined,
    adults: Number(params.get('adults') ?? 2),
    children: Number(params.get('children') ?? 0),
    rooms: Number(params.get('rooms') ?? 1),
    sort: (params.get('sort') ?? 'recommended') as 'recommended',
    ...Object.fromEntries(
      FILTER_TOGGLES.filter((f) => params.get(f.key) === 'true').map((f) => [f.key, true]),
    ),
  };

  const search = useQuery({
    queryKey: ['search', Object.fromEntries(params)],
    queryFn: ({ signal }) => api.search(filters, signal),
    enabled: Boolean(filters.citySlug),
  });

  const natural = useQuery({
    queryKey: ['natural-search', naturalQuery, locale],
    queryFn: () => api.naturalSearch(naturalQuery, locale),
    enabled: false,
  });

  const results = mode === 'natural' ? natural.data : search.data;

  const setParam = (key: string, value: string | null) => {
    setMode('filters');
    const next = new URLSearchParams(params);
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next);
  };

  return (
    <div className="space-y-10">
      {/* Premium hero — resort artwork + Apple-style frosted glass search card */}
      <section className="relative overflow-hidden rounded-4xl shadow-glass-lg">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroBg})` }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/70"
          aria-hidden="true"
        />

        <div className="relative px-5 py-12 sm:px-10 sm:py-16">
          <span className="glass-chip border-white/40 bg-white/15 text-white">
            ✨ Verified stays across India
          </span>
          <h1 className="mt-5 max-w-2xl text-3xl font-bold leading-tight text-white sm:text-5xl">
            Find your perfect <span className="gradient-text">stay</span> — someone always answers.
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/85 sm:text-base">
            Honest all-inclusive prices, real verified-stay reviews, and a property that never
            misses your call.
          </p>

          {/* Natural-language search — works in all ten languages */}
          <div className="glass-panel mt-8 p-4 sm:p-6">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (naturalQuery.trim().length >= 3) {
                  setMode('natural');
                  void natural.refetch();
                }
              }}
              className="flex flex-col gap-3 sm:flex-row"
            >
              <label className="flex-1">
                <span className="sr-only">{t('search.placeholder')}</span>
                <input
                  value={naturalQuery}
                  onChange={(event) => setNaturalQuery(event.target.value)}
                  placeholder={t('search.naturalPlaceholder')}
                  className="input border-white/40 bg-white/90"
                  maxLength={300}
                />
              </label>
              <button type="submit" className="btn-glass-primary sm:w-40" disabled={natural.isFetching}>
                {natural.isFetching ? t('common.loading') : t('search.submit')}
              </button>
            </form>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label>
                <span className="label text-white/90">{t('search.checkIn')}</span>
                <input
                  type="date"
                  value={filters.checkIn ?? ''}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setParam('checkIn', event.target.value)}
                  className="input border-white/40 bg-white/90"
                />
              </label>
              <label>
                <span className="label text-white/90">{t('search.checkOut')}</span>
                <input
                  type="date"
                  value={filters.checkOut ?? ''}
                  min={filters.checkIn ?? new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setParam('checkOut', event.target.value)}
                  className="input border-white/40 bg-white/90"
                />
              </label>
              <label>
                <span className="label text-white/90">{t('search.adults')}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={filters.adults}
                  onChange={(event) => setParam('adults', event.target.value)}
                  className="input border-white/40 bg-white/90"
                />
              </label>
              <label>
                <span className="label text-white/90">{t('search.rooms')}</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={filters.rooms}
                  onChange={(event) => setParam('rooms', event.target.value)}
                  className="input border-white/40 bg-white/90"
                />
              </label>
            </div>
          </div>
        </div>
      </section>

      {/* Place-based inspiration — same pattern as Agoda / OYO / MakeMyTrip home screens */}
      <DestinationsStrip
        activeSlug={filters.citySlug}
        onPick={(slug) => {
          setNaturalQuery('');
          setParam('city', slug);
        }}
      />

      {/* What the AI understood — shown, correctable, never silent */}
      {results?.interpretedQuery && (
        <section
          className={`glass-card p-4 text-sm ${
            results.interpretedQuery.degraded ? 'border-amber-300 bg-amber-50/90' : 'bg-brand-50/90'
          }`}
        >
          {results.interpretedQuery.degraded ? (
            <p className="font-medium text-amber-900">
              Smart search is unavailable right now — showing plain results. Use the date and filter
              controls above to narrow your search.
            </p>
          ) : (
            <>
              <p className="font-medium text-brand-900">
                {t('search.understood')}:{' '}
                {results.interpretedQuery.filters.citySlug ?? '—'}
                {results.interpretedQuery.filters.checkIn &&
                  ` · ${results.interpretedQuery.filters.checkIn} → ${results.interpretedQuery.filters.checkOut}`}
                {` · ${results.interpretedQuery.filters.adults} ${t('search.adults')}`}
              </p>
              {results.interpretedQuery.unresolvedTerms.length > 0 && (
                <p className="mt-1 text-amber-800">
                  {t('search.couldNotUnderstand', {
                    terms: results.interpretedQuery.unresolvedTerms.join(', '),
                  })}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Policy filters that decide whether a guest is turned away at check-in */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('search.filters')}</h2>
        <div className="flex flex-wrap gap-2">
          {FILTER_TOGGLES.map((filter) => {
            const active = params.get(filter.key) === 'true';
            return (
              <button
                key={filter.key}
                type="button"
                aria-pressed={active}
                onClick={() => setParam(filter.key, active ? null : 'true')}
                className="glass-chip"
              >
                {t(filter.label as TranslationKey)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Results */}
      {search.isLoading && <p className="text-sm text-slate-500">{t('common.loading')}</p>}

      {results ? (
        <section aria-live="polite">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {t('search.results', { count: results.items.length })}
          </h2>

          {results.items.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <p className="font-medium text-slate-800">{t('search.noResults')}</p>
              <p className="mt-1 text-sm text-slate-600">{t('search.noResultsHint')}</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {results.items.map((item) => (
                <ResultCard key={item.property.propertyId} item={item} />
              ))}
            </ul>
          )}
        </section>
      ) : (
        !search.isLoading && (
          <section className="grid gap-4 sm:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div key={point.text} className="glass-card flex flex-col gap-2 p-5">
                <span className="text-2xl" aria-hidden="true">
                  {point.emoji}
                </span>
                <p className="text-sm text-slate-700">{point.text}</p>
              </div>
            ))}
          </section>
        )
      )}
    </div>
  );
}

const CARD_GRADIENTS = [
  'from-amber-400 to-orange-600',
  'from-teal-400 to-emerald-600',
  'from-sky-400 to-indigo-600',
  'from-rose-400 to-fuchsia-600',
  'from-lime-400 to-teal-600',
  'from-violet-400 to-purple-700',
] as const;

/** Deterministic per-property gradient — a friendly stand-in until a photo loads. */
function gradientFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length] ?? CARD_GRADIENTS[0];
}

function ResultCard({ item }: { item: SearchResultItem }) {
  const { t } = useI18n();
  const money = useMoney();
  const { property, availability } = item;

  return (
    <li className="glass-card overflow-hidden">
      <Link to={`/property/${property.propertyId}`} className="block">
        <div
          className={`flex h-32 items-end bg-gradient-to-br p-3 ${gradientFor(property.name)}`}
          aria-hidden="true"
        >
          <span className="rounded-full bg-black/25 px-2.5 py-1 text-xs font-medium capitalize text-white">
            {property.type}
          </span>
        </div>

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">{property.name}</h3>
              <p className="text-sm text-slate-600">
                {property.address.city}, {property.address.state}
              </p>
            </div>
            {property.rating && (
              <span className="badge-verified shrink-0">
                ★ {property.rating.average} ({property.rating.count})
              </span>
            )}
          </div>

          {/* Plain-language reasons — ranking is never a black box */}
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {item.matchReasons.slice(0, 4).map((reason) => (
              <li key={reason} className="badge-info">
                {t(reason as TranslationKey)}
              </li>
            ))}
          </ul>

          {availability ? (
            <div className="mt-3 border-t border-slate-200/70 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-semibold">
                  {money(availability.lowestOption.quote.totalPayablePaise)}
                </span>
                <span className="text-xs text-slate-500">
                  {availability.lowestOption.quote.nights}N · {t('price.total')}
                </span>
              </div>
              <p className="text-xs font-medium text-emerald-700">{t('price.noHiddenFees')}</p>
              {availability.roomsLeft <= 3 && (
                <p className="mt-1 text-xs text-amber-700">
                  {t('property.roomsLeft', { count: availability.roomsLeft })}
                </p>
              )}
            </div>
          ) : (
            property.lowestNightlyRatePaise && (
              <p className="mt-3 border-t border-slate-200/70 pt-3 text-sm text-slate-700">
                {money(property.lowestNightlyRatePaise)} {t('price.perNight')}
              </p>
            )
          )}
        </div>
      </Link>
    </li>
  );
}

