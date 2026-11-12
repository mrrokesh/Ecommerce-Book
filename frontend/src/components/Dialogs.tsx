import { useEffect, useRef, useState } from 'react';

type AskOptions = {
  title: string;
  label?: string;
  confirmText?: string;
  type?: 'text' | 'password';
  minLength?: number;
  multiline?: boolean;
};
type Pending = AskOptions & { resolve: (value: string | null) => void };

const EVENT = 'sbh:ask';
const CONFIRM = 'sbh:confirm';
type PendingConfirm = { message: string; resolve: (ok: boolean) => void };

/** Promise-based replacement for window.confirm. */
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(CONFIRM, { detail: { message, resolve } }));
  });
}

/** Promise-based replacement for window.prompt (which many in-app browsers block). Resolves null on cancel. */
export function askText(options: AskOptions): Promise<string | null> {
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { ...options, resolve } }));
  });
}

export default function DialogHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState('');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [confirming, setConfirming] = useState<PendingConfirm | null>(null);

  useEffect(() => {
    function onAsk(e: Event) {
      setValue('');
      setPending((e as CustomEvent).detail as Pending);
    }
    function onConfirm(e: Event) {
      setConfirming((e as CustomEvent).detail as PendingConfirm);
    }
    window.addEventListener(EVENT, onAsk);
    window.addEventListener(CONFIRM, onConfirm);
    return () => {
      window.removeEventListener(EVENT, onAsk);
      window.removeEventListener(CONFIRM, onConfirm);
    };
  }, []);

  useEffect(() => {
    if (pending) ref.current?.focus();
  }, [pending]);

  if (confirming) {
    const answer = (ok: boolean) => {
      confirming.resolve(ok);
      setConfirming(null);
    };
    return (
      <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && answer(false)}>
        <div className="dialog-card" role="alertdialog" aria-modal="true" aria-label="Please confirm" onKeyDown={(e) => e.key === 'Escape' && answer(false)}>
          <h2>Please confirm</h2>
          <p>{confirming.message}</p>
          <div className="dialog-actions">
            <button type="button" className="btn btn-outline" onClick={() => answer(false)}>Cancel</button>
            <button type="button" className="btn btn-navy" autoFocus onClick={() => answer(true)}>Confirm</button>
          </div>
        </div>
      </div>
    );
  }
  if (!pending) return null;
  const min = pending.minLength ?? 1;
  const close = (result: string | null) => {
    pending.resolve(result);
    setPending(null);
  };
  const valid = value.trim().length >= min;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <form
        className="dialog-card"
        role="dialog"
        aria-modal="true"
        aria-label={pending.title}
        onKeyDown={(e) => e.key === 'Escape' && close(null)}
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) close(value.trim());
        }}
      >
        <h2>{pending.title}</h2>
        <label>
          {pending.label || ''}
          {pending.multiline ? (
            <textarea ref={ref} rows={3} value={value} onChange={(e) => setValue(e.target.value)} />
          ) : (
            <input ref={ref} type={pending.type || 'text'} value={value} onChange={(e) => setValue(e.target.value)} />
          )}
        </label>
        {min > 1 ? <small>At least {min} characters.</small> : null}
        <div className="dialog-actions">
          <button type="button" className="btn btn-outline" onClick={() => close(null)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-navy" disabled={!valid}>
            {pending.confirmText || 'Confirm'}
          </button>
        </div>
      </form>
    </div>
  );
}
