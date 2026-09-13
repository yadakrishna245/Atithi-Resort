import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from '@atithi/shared';
import { referenceTranslations, translations, type TranslationKey } from './translations';

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  locales: typeof SUPPORTED_LOCALES;
  labels: typeof LOCALE_LABELS;
}

const I18nContext = createContext<I18nValue | null>(null);

const STORAGE_KEY = 'atithi.locale';

/** Honours a saved choice, then the device language, then English. */
function detectInitialLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) return saved as Locale;

  for (const candidate of navigator.languages ?? [navigator.language]) {
    const base = candidate.split('-')[0]?.toLowerCase();
    if (base && (SUPPORTED_LOCALES as readonly string[]).includes(base)) return base as Locale;
  }

  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  /**
   * Falls back to English for any key a language has not translated yet, so a
   * partially translated locale still renders a usable screen.
   */
  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const template = translations[locale]?.[key] ?? referenceTranslations[key] ?? key;

      if (!vars) return template;
      return Object.entries(vars).reduce(
        (acc, [name, value]) => acc.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value)),
        template,
      );
    },
    [locale],
  );

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t, locales: SUPPORTED_LOCALES, labels: LOCALE_LABELS }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}

/** Indian digit grouping for every displayed amount. */
export function useMoney() {
  const { locale } = useI18n();

  return useCallback(
    (paise: number) =>
      new Intl.NumberFormat(`${locale}-IN`, {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(paise / 100),
    [locale],
  );
}
