import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useI18n, useMoney } from '../i18n';

/**
 * Partner view.
 *
 * Every request here resolves to the org in the caller's token. A partner
 * cannot see another property's bookings, and never sees a guest's stays at
 * any property other than their own.
 */
export default function PartnerDashboardPage() {
  const { isPartner } = useAuth();
  const { t } = useI18n();
  const money = useMoney();

  const properties = useQuery({
    queryKey: ['partner', 'properties'],
    queryFn: () => api.partner.listProperties(),
    enabled: isPartner,
  });

  const bookings = useQuery({
    queryKey: ['partner', 'bookings'],
    queryFn: () => api.partner.listBookings({ from: new Date().toISOString().slice(0, 10) }),
    enabled: isPartner,
  });

  if (!isPartner) return <Navigate to="/" replace />;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">{t('partner.dashboard')}</h1>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('partner.properties')}
        </h2>

        {properties.data?.notice && (
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            {properties.data.notice}
          </p>
        )}

        {properties.isLoading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(properties.data?.data ?? []).map((property) => (
              <li key={property.propertyId} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{property.name}</h3>
                    <p className="text-sm text-slate-600">
                      {property.address.city} · {property.totalRooms} rooms
                    </p>
                  </div>
                  <span
                    className={
                      property.verificationStatus === 'verified' ? 'badge-verified' : 'badge-warn'
                    }
                  >
                    {property.verificationStatus.replace(/_/g, ' ')}
                  </span>
                </div>

                {property.verificationStatus !== 'verified' && (
                  <p className="mt-2 text-xs text-slate-500">{t('partner.verificationNote')}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {t('partner.bookings')}
        </h2>

        {bookings.isLoading ? (
          <p className="text-sm text-slate-500">{t('common.loading')}</p>
        ) : (bookings.data?.data ?? []).length === 0 ? (
          <p className="text-sm text-slate-600">{t('booking.noBookings')}</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Upcoming arrivals</caption>
              <thead className="border-b border-slate-200 bg-slate-50 text-left">
                <tr>
                  <th scope="col" className="p-3">{t('booking.reference')}</th>
                  <th scope="col" className="p-3">{t('checkout.guestDetails')}</th>
                  <th scope="col" className="p-3">{t('search.checkIn')}</th>
                  <th scope="col" className="p-3">{t('search.guests')}</th>
                  <th scope="col" className="p-3">{t('price.total')}</th>
                  <th scope="col" className="p-3">{t('booking.status')}</th>
                </tr>
              </thead>
              <tbody>
                {(bookings.data?.data ?? []).map((booking) => (
                  <tr key={booking.bookingId} className="border-b border-slate-100">
                    <td className="p-3 font-medium">{booking.reference}</td>
                    <td className="p-3">
                      {booking.primaryGuest.fullName}
                      <span className="block text-xs text-slate-500">{booking.primaryGuest.phone}</span>
                    </td>
                    <td className="p-3">
                      {booking.checkIn}
                      <span className="block text-xs text-slate-500">
                        {t('booking.nights', { count: booking.nights })}
                      </span>
                    </td>
                    <td className="p-3">
                      {booking.adults + booking.children}
                      {booking.members.length > 0 && (
                        <span className="block text-xs text-slate-500">
                          {booking.members.length} named
                        </span>
                      )}
                    </td>
                    <td className="p-3">{money(booking.quote.totalPayablePaise)}</td>
                    <td className="p-3">
                      <span className="badge-info">{booking.status.replace(/_/g, ' ')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
