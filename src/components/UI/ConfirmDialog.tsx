// Lightweight confirm dialog used for destructive/irreversible actions
// (e.g. abandoning a game in progress). Visual style intentionally mirrors
// the other modals (gradient background + accent border + accent-colored
// primary button).

import { useT } from '../../i18n/LanguageContext';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  if (!isOpen) return null;
  const confirmText = confirmLabel ?? t.common.confirm;
  const cancelText = cancelLabel ?? t.common.cancel;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 160,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1e3a2f 0%, #0d1f17 100%)',
          border: '2px solid var(--color-accent)',
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', color: 'var(--color-text-primary)' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 20px', color: 'var(--color-text-secondary)' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '8px 20px',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '6px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
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
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
