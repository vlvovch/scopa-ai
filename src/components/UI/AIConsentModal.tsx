// The data notice shown once before the first game against an AI service
// (src/ai/consent.ts): what a game sends, where it goes for the seats about
// to play, and the choice to allow it or seat a CPU opponent instead. Styled
// like ConfirmDialog and, like it, above every other overlay.

import { useT } from '../../i18n/LanguageContext';
import type { AIDataDestination } from '../../ai/consent';
import { MAIN_SITE_URL } from '../../platform/links';

interface AIConsentModalProps {
  isOpen: boolean;
  /** Where the seats about to play would send the game ('free', 'key'). */
  destinations: readonly AIDataDestination[];
  onAllow: () => void;
  onDecline: () => void;
}

export function AIConsentModal({ isOpen, destinations, onAllow, onDecline }: AIConsentModalProps) {
  const t = useT();
  if (!isOpen) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1100,
      }}
      onClick={onDecline}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-consent-title"
        style={{
          background: 'linear-gradient(180deg, #1e3a2f 0%, #0d1f17 100%)',
          border: '2px solid var(--color-accent)',
          borderRadius: '12px',
          padding: '24px',
          width: '100%',
          maxWidth: '480px',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          textAlign: 'left',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.45,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="ai-consent-title" style={{ margin: '0 0 12px', color: 'var(--color-text-primary)' }}>
          {t.aiConsent.title}
        </h3>
        <p style={{ margin: '0 0 12px' }}>{t.aiConsent.intro}</p>
        <ul style={{ margin: '0 0 12px', paddingLeft: '20px' }}>
          {destinations.includes('free') && <li>{t.aiConsent.free}</li>}
          {destinations.includes('key') && <li>{t.aiConsent.key}</li>}
          <li>{t.aiConsent.local}</li>
        </ul>
        <p style={{ margin: '0 0 20px', fontSize: '0.9em' }}>
          <a href={`${MAIN_SITE_URL}/privacy.html`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>
            {t.aiConsent.privacyLink}
          </a>
          {' · '}
          {t.aiConsent.footnote}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onDecline}
            style={{
              padding: '8px 20px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {t.aiConsent.decline}
          </button>
          <button
            type="button"
            onClick={onAllow}
            autoFocus
            style={{
              padding: '8px 20px',
              background: 'var(--color-accent)',
              border: 'none',
              borderRadius: '6px',
              color: '#000',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t.aiConsent.allow}
          </button>
        </div>
      </div>
    </div>
  );
}
