// Compact flag-based language switcher for the start screens. The full
// Settings modal is only reachable in-game, so without this a user who
// lands on the entry screen in the wrong language has no way to switch.
// Fixed to the top-right corner; flags stay readable in any language.

import { useLanguage, type Language } from '../../i18n/LanguageContext';

const OPTIONS: { value: Language; flag: string; name: string }[] = [
  { value: 'en', flag: '🇬🇧', name: 'English' },
  { value: 'it', flag: '🇮🇹', name: 'Italiano' },
];

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div
      role="group"
      aria-label="Language / Lingua"
      style={{
        position: 'fixed',
        top: '0.75rem',
        right: '0.75rem',
        zIndex: 50,
        display: 'flex',
        gap: '4px',
        padding: '4px',
        background: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '10px',
        backdropFilter: 'blur(2px)',
      }}
    >
      {OPTIONS.map((option) => {
        const active = language === option.value;
        return (
          <button
            key={option.value}
            onClick={() => setLanguage(option.value)}
            title={option.name}
            aria-label={option.name}
            aria-pressed={active}
            style={{
              padding: '4px 8px',
              fontSize: '1.1rem',
              lineHeight: 1,
              background: active ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
              border: active
                ? '1px solid var(--color-accent)'
                : '1px solid transparent',
              borderRadius: '7px',
              cursor: 'pointer',
              opacity: active ? 1 : 0.55,
            }}
          >
            {option.flag}
          </button>
        );
      })}
    </div>
  );
}
