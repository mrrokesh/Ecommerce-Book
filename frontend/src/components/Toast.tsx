import { useEffect, useState } from 'react';

const EVENT = 'sbh:toast';

type ToastItem = { id: number; message: string };

/** Show a short confirmation message from anywhere (no provider needed). */
export function showToast(message: string, ms = 2800) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, ms } }));
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const timers = new Map<number, number>();
    function onToast(e: Event) {
      const d = (e as CustomEvent).detail;
      const text = typeof d === 'string' ? d : String(d?.message || '');
      if (!text) return;
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev.slice(-3), { id, message: text }]);
      const ms = typeof d === 'object' && d?.ms ? d.ms : 2800;
      timers.set(
        id,
        window.setTimeout(() => {
          setItems((prev) => prev.filter((t) => t.id !== id));
          timers.delete(id);
        }, ms)
      );
    }
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <div className="toast-host" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  );
}
