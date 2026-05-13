import { useEffect, useState } from 'react';

/* A promise-based confirm dialog matching the app's visual language.
   Usage:
     import { confirm, ConfirmHost } from './Confirm.jsx';
     // mount <ConfirmHost /> once at app root
     const ok = await confirm({ title, body, confirmText, danger });

   The implementation uses module-level state plus a tiny pub/sub so the
   dialog can be triggered from anywhere without prop drilling. */

let _state = null;
const _subs = new Set();
function _notify() { _subs.forEach(fn => fn(_state)); }

export function confirm({ title, body, confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    _state = { title, body, confirmText, cancelText, danger, resolve };
    _notify();
  });
}

export function ConfirmHost() {
  const [s, setS] = useState(_state);
  useEffect(() => {
    _subs.add(setS);
    return () => _subs.delete(setS);
  }, []);

  if (!s) return null;

  const close = (answer) => {
    s.resolve(answer);
    _state = null;
    _notify();
  };

  return (
    <div
      onClick={() => close(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 60,
        background: 'color-mix(in oklab, var(--olive-deep) 55%, transparent)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadein 140ms ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: 420, maxWidth: '100%',
          background: 'var(--cream)', borderRadius: 18,
          boxShadow: '0 24px 60px color-mix(in oklab, var(--olive-deep) 35%, transparent)',
          padding: '22px 24px',
          animation: 'slidein 220ms cubic-bezier(0.16, 1, 0.3, 1) both',
        }}
      >
        <div className="mono" style={{
          fontSize: 10, color: s.danger ? 'var(--danger)' : 'var(--olive-soft)',
          letterSpacing: '0.14em', fontWeight: 700, marginBottom: 10,
          textTransform: 'uppercase',
        }}>
          {s.danger ? 'Confirm deletion' : 'Confirm'}
        </div>
        <div style={{
          fontSize: 20, fontWeight: 800, color: 'var(--ink)',
          letterSpacing: '-0.02em', marginBottom: 8, lineHeight: 1.25,
        }}>
          {s.title}
        </div>
        {s.body && (
          <div style={{ fontSize: 13, color: 'var(--olive-soft)', lineHeight: 1.5, marginBottom: 18 }}>
            {s.body}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button
            onClick={() => close(false)}
            style={{
              padding: '9px 16px', border: 'none', borderRadius: 10,
              background: 'var(--cream-2)', color: 'var(--ink)',
              fontFamily: 'var(--font-display)',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.01em',
              cursor: 'pointer',
              transition: 'background 140ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in oklab, var(--olive) 14%, var(--cream-2))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--cream-2)'; }}
            autoFocus
          >{s.cancelText}</button>
          <button
            onClick={() => close(true)}
            style={{
              padding: '9px 16px', border: 'none', borderRadius: 10,
              background: s.danger ? 'var(--danger)' : 'var(--accent)',
              color: 'white',
              fontFamily: 'var(--font-display)',
              fontSize: 13, fontWeight: 700, letterSpacing: '0.01em',
              cursor: 'pointer',
              transition: 'transform 120ms ease, filter 140ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.filter = 'brightness(1.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.filter = 'brightness(1)'; }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
          >{s.confirmText}</button>
        </div>
      </div>
    </div>
  );
}
