import { useEffect, useState } from 'react';

const EVENT = 'sbh:toast';

/** Show a short confirmation message from anywhere (no provider needed). */
export function showToast(message: string, ms = 2600) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, ms } }));
}

export default function ToastHost() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let timer: number | undefined;
    function onToast(e: Event) {
      const d = (e as CustomEvent).detail;
      const text = typeof d === 'string' ? d : String(d?.message || '');
      setMsg(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(''), typeof d === 'object' && d?.ms ? d.ms : 2600);
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {msg ? <div className="toast">{msg}</div> : null}
    </div>
  );
}
