import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useI18n } from '../i18n';

/**
 * Phone-first sign-in with an SMS one-time code.
 *
 * No password to remember, and the number we verify is the same number a
 * property would use to call the guest back.
 */
export default function LoginPage() {
  const { user, startPhoneSignIn, confirmOtp } = useAuth();
  const { t } = useI18n();
  const location = useLocation() as { state?: { from?: string } };

  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (user) return <Navigate to={location.state?.from ?? '/'} replace />;

  const sendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await startPhoneSignIn(phone);
      setStep('otp');
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await confirmOtp(code);
    } catch {
      setError(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">{t('auth.signIn')}</h1>

      {step === 'phone' ? (
        <form onSubmit={sendOtp} className="card mt-6 space-y-4 p-5">
          <label>
            <span className="label">{t('auth.phone')}</span>
            <input
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
              pattern="\+91[6-9][0-9]{9}"
              placeholder="+919876543210"
              inputMode="tel"
              autoComplete="tel"
              className="input"
            />
          </label>

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('common.loading') : t('auth.sendOtp')}
          </button>

          <p className="text-xs text-slate-500">{t('auth.privacyNote')}</p>
        </form>
      ) : (
        <form onSubmit={verify} className="card mt-6 space-y-4 p-5">
          <label>
            <span className="label">{t('auth.enterOtp')}</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              required
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input tracking-[0.5em]"
            />
          </label>

          <button type="submit" className="btn-primary w-full" disabled={busy || code.length < 4}>
            {busy ? t('common.loading') : t('auth.verify')}
          </button>

          <button type="button" onClick={() => setStep('phone')} className="btn-secondary w-full">
            {t('common.back')}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
