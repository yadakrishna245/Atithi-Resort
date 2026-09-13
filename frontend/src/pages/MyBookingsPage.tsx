import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Booking } from '@atithi/shared';
import { api } from '../lib/api';
import { useI18n, useMoney } from '../i18n';

/**
 * A guest sees only their own bookings. The request carries no user id — the
 * server derives it from the token — so there is nothing here that could be
 * tampered with to view someone else's stay.
 */
export default function MyBookingsPage() {
  const { t } = useI18n();

  const bookings = useQuery({ queryKey: ['bookings'], queryFn: () => api.listBookings() });

  if (bookings.isLoading) return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  if (bookings.isError) return <p className="text-sm text-rose-700">{t('common.error')}</p>;

  const items = bookings.data?.data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = items.filter(
    (b) => b.checkOut >= today && !b.status.startsWith('cancelled'),
  );
  const past = items.filter((b) => b.checkOut < today || b.status.startsWith('cancelled'));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t('nav.bookings')}</h1>

      {items.length === 0 && <p className="text-slate-600">{t('booking.noBookings')}</p>}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('booking.upcoming')}
          </h2>
          <ul className="space-y-3">
            {upcoming.map((booking) => (
              <BookingCard key={booking.bookingId} booking={booking} cancellable />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            {t('booking.past')}
          </h2>
          <ul className="space-y-3">
            {past.map((booking) => (
              <BookingCard key={booking.bookingId} booking={booking} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function BookingCard({ booking, cancellable = false }: { booking: Booking; cancellable?: boolean }) {
  const { t } = useI18n();
  const money = useMoney();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [showCancel, setShowCancel] = useState(false);

  const cancel = useMutation({
    mutationFn: () => api.cancelBooking(booking.bookingId, reason),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['bookings'] }),
  });

  const canCancel = cancellable && ['pending_payment', 'confirmed'].includes(booking.status);

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {t('booking.reference')}: <strong className="text-slate-800">{booking.reference}</strong>
          </p>
          <p className="mt-1 text-sm text-slate-700">
            {booking.checkIn} → {booking.checkOut} · {t('booking.nights', { count: booking.nights })} ·{' '}
            {booking.rooms} {t('search.rooms')}
          </p>
          <p className="text-sm text-slate-600">
            {booking.adults} {t('search.adults')}
            {booking.children > 0 && ` · ${booking.children} ${t('search.children')}`}
          </p>
        </div>

        <div className="text-right">
          <span className="badge-info">{booking.status.replace(/_/g, ' ')}</span>
          <p className="mt-1 font-semibold">{money(booking.quote.totalPayablePaise)}</p>
        </div>
      </div>

      {booking.freeCancellationUntil && canCancel && (
        <p className="mt-2 text-xs text-emerald-700">
          {t('booking.freeCancelUntil', {
            date: new Date(booking.freeCancellationUntil).toLocaleString('en-IN'),
          })}
        </p>
      )}

      {booking.refundPaise > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          {t('booking.refundAmount', { amount: money(booking.refundPaise) })}
        </p>
      )}

      {canCancel && (
        <div className="mt-3">
          {showCancel ? (
            <div className="flex flex-wrap gap-2">
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={t('booking.cancelReason')}
                className="input flex-1"
                minLength={3}
              />
              <button
                type="button"
                onClick={() => cancel.mutate()}
                disabled={reason.trim().length < 3 || cancel.isPending}
                className="btn-primary"
              >
                {t('booking.cancel')}
              </button>
              <button type="button" onClick={() => setShowCancel(false)} className="btn-secondary">
                {t('common.close')}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setShowCancel(true)} className="btn-secondary">
              {t('booking.cancel')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
