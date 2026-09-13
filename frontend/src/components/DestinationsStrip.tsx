/**
 * Curated destination inspiration, the same "explore by place" pattern used
 * by Agoda / OYO / MakeMyTrip on their home screens. Picking a card sets the
 * city filter directly so results render immediately — no typing required.
 */
const DESTINATIONS = [
  { slug: 'goa', name: 'Goa', tagline: 'Beaches & nightlife', emoji: '🏖️' },
  { slug: 'coorg', name: 'Coorg', tagline: 'Coffee estates & misty hills', emoji: '🌿' },
  { slug: 'manali', name: 'Manali', tagline: 'Snow peaks & river valleys', emoji: '🏔️' },
  { slug: 'udaipur', name: 'Udaipur', tagline: 'Lakes & royal palaces', emoji: '🏰' },
  { slug: 'munnar', name: 'Munnar', tagline: 'Tea gardens & waterfalls', emoji: '🍃' },
  { slug: 'jaipur', name: 'Jaipur', tagline: 'Forts & heritage havelis', emoji: '🕌' },
  { slug: 'rishikesh', name: 'Rishikesh', tagline: 'Ganga ghats & yoga retreats', emoji: '🕉️' },
  { slug: 'alleppey', name: 'Alleppey', tagline: 'Backwaters & houseboats', emoji: '🚤' },
] as const;

export default function DestinationsStrip({
  activeSlug,
  onPick,
}: {
  activeSlug?: string;
  onPick: (slug: string) => void;
}) {
  return (
    <section aria-label="Popular destinations in India">
      <h2 className="mb-3 text-sm font-semibold text-slate-800">Popular destinations in India</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {DESTINATIONS.map((dest) => {
          const active = dest.slug === activeSlug;
          return (
            <button
              key={dest.slug}
              type="button"
              onClick={() => onPick(dest.slug)}
              aria-pressed={active}
              className={`glass-card group flex w-40 shrink-0 snap-start flex-col items-start gap-2 p-4 text-left ${
                active ? 'ring-2 ring-brand-600' : ''
              }`}
            >
              <span className="text-3xl" aria-hidden="true">
                {dest.emoji}
              </span>
              <span className="font-semibold text-slate-900">{dest.name}</span>
              <span className="text-xs leading-snug text-slate-600">{dest.tagline}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
