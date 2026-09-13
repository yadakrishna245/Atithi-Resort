import { useState } from 'react';
import type { PriceQuote } from '@atithi/shared';
import { useI18n, useMoney } from '../i18n';

/**
 * The full price, itemised, every time.
 *
 * The breakdown is one tap away on the search card and expanded by default at
 * checkout — the opposite of the pattern where taxes and fees only appear on
 * the final payment screen.
 */
export default function PriceBreakdown({
  quote,
  defaultOpen = false,
}: {
  quote: PriceQuote;
  defaultOpen?: boolean;
}) {
  const { t } = useI18n();
  const money = useMoney();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium text-slate-700">{t('price.total')}</span>
        <span className="text-xl font-semibold text-slate-900">
          {money(quote.totalPayablePaise)}
        </span>
      </div>

      <p className="mt-1 text-xs font-medium text-emerald-700">{t('price.noHiddenFees')}</p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-2 text-xs font-medium text-brand-700 underline underline-offset-2"
      >
        {t('price.breakdown')}
      </button>

      {open && (
        <dl className="mt-3 space-y-2 border-t border-slate-200 pt-3">
          {quote.lineItems.map((item, index) => (
            <div key={`${item.labelKey}-${index}`} className="flex justify-between gap-4 text-sm">
              <dt className="text-slate-600">
                {item.label}
                {item.detail && (
                  <span className="block text-xs text-slate-400">{item.detail}</span>
                )}
              </dt>
              <dd
                className={
                  item.kind === 'discount' ? 'font-medium text-emerald-700' : 'text-slate-800'
                }
              >
                {money(item.amountPaise)}
              </dd>
            </div>
          ))}

          {quote.taxBreakdown.length > 0 && (
            <div className="border-t border-slate-200 pt-2 text-xs text-slate-500">
              {quote.taxBreakdown.map((tax) => (
                <div key={tax.name} className="flex justify-between">
                  <span>
                    {tax.name} @ {tax.ratePercent}%
                  </span>
                  <span>{money(tax.amountPaise)}</span>
                </div>
              ))}
            </div>
          )}

          {quote.payAtPropertyPaise > 0 && (
            <div className="flex justify-between border-t border-slate-200 pt-2 text-sm">
              <dt className="font-medium text-slate-700">{t('price.payAtProperty')}</dt>
              <dd className="font-medium">{money(quote.payAtPropertyPaise)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
