import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useI18n } from './i18n';
import { useAuth } from './lib/auth';
import LanguageSwitcher from './components/LanguageSwitcher';

const SearchPage = lazy(() => import('./pages/SearchPage'));
const PropertyPage = lazy(() => import('./pages/PropertyPage'));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage'));
const MyBookingsPage = lazy(() => import('./pages/MyBookingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const PartnerDashboardPage = lazy(() => import('./pages/PartnerDashboardPage'));

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return children;
}

function FullPageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status" aria-live="polite">
      <span className="text-sm text-slate-500">{t('common.loading')}</span>
    </div>
  );
}

function Header() {
  const { t } = useI18n();
  const { user, isPartner, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/70 shadow-sm backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link to="/" className="bg-gradient-to-r from-brand-700 to-brand-500 bg-clip-text text-lg font-semibold text-transparent">
          {t('app.name')}
        </Link>

        <nav className="ml-auto flex items-center gap-1 sm:gap-3" aria-label="Main">
          {user && (
            <Link to="/bookings" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
              {t('nav.bookings')}
            </Link>
          )}
          {isPartner && (
            <Link to="/partner" className="rounded-lg px-3 py-2 text-sm hover:bg-slate-100">
              {t('nav.partner')}
            </Link>
          )}

          <LanguageSwitcher />

          {user ? (
            <button type="button" onClick={() => void signOut()} className="btn-secondary">
              {t('nav.signOut')}
            </button>
          ) : (
            <Link to="/login" className="btn-primary">
              {t('nav.signIn')}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  const { t } = useI18n();

  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-600">
        <p className="font-medium text-slate-800">{t('app.tagline')}</p>
        <ul className="mt-3 space-y-1">
          <li>• Every listing is verified by our team before it appears in search.</li>
          <li>• Ratings come only from guests who completed a stay.</li>
          <li>• The price you see includes all taxes. There is no convenience fee.</li>
          <li>• Your data is stored in India and you can export or delete it at any time.</li>
        </ul>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <Header />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        <Suspense fallback={<FullPageLoader />}>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/property/:propertyId" element={<PropertyPage />} />
            <Route
              path="/checkout"
              element={
                <RequireAuth>
                  <CheckoutPage />
                </RequireAuth>
              }
            />
            <Route
              path="/bookings"
              element={
                <RequireAuth>
                  <MyBookingsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/partner"
              element={
                <RequireAuth>
                  <PartnerDashboardPage />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
