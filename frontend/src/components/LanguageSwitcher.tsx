import { useI18n } from '../i18n';
import type { Locale } from '@atithi/shared';

/**
 * Language is switchable from every screen, not buried in settings.
 * Options are shown in their own script so a Tamil speaker can find தமிழ்
 * without reading English first.
 */
export default function LanguageSwitcher() {
  const { locale, setLocale, locales, labels, t } = useI18n();

  return (
    <label className="relative">
      <span className="sr-only">{t('nav.language')}</span>
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="cursor-pointer rounded-lg border border-slate-300 bg-white py-2 pl-3 pr-8 text-sm"
        style={{ minHeight: 44 }}
      >
        {locales.map((code) => (
          <option key={code} value={code}>
            {labels[code].native}
          </option>
        ))}
      </select>
    </label>
  );
}
