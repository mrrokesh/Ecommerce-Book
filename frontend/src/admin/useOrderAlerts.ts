import { useEffect, useRef } from 'react';
import api from '../api/client';
import { showToast } from '../components/Toast';
import { playChime, showDesktopNotification, unlockAudio } from '../lib/alertSound';
import { formatPrice } from '../utils/format';

type NewOrder = { id: string; orderNumber: string; total: number; paymentMethod: string; customer?: string };

const POLL_MS = 20000;

/**
 * Chime + toast + desktop notification when a customer places an order while the admin is open.
 * Orders that already exist at load are not announced. Polls every 20 seconds (no websockets needed).
 */
export function useOrderAlerts(active: boolean, sound: boolean, onNewOrders?: () => void) {
  const seen = useRef<Set<string>>(new Set());
  const since = useRef<string | null>(null);
  const unread = useRef(0);
  const baseTitle = useRef('');
  const soundRef = useRef(sound);
  const callback = useRef(onNewOrders);
  soundRef.current = sound;
  callback.current = onNewOrders;

  useEffect(() => {
    if (!active) return undefined;
    baseTitle.current = document.title;
    // The first click or key press anywhere lets the browser play sound
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const clearBadge = () => { unread.current = 0; document.title = baseTitle.current; };
    window.addEventListener('focus', clearBadge);

    let stopped = false;
    async function poll() {
      try {
        const { data } = await api.get('/admin/order-alerts', { params: since.current ? { since: since.current } : {} });
        if (stopped) return;
        const first = since.current === null;
        since.current = data.asOf;
        if (first) return; // do not announce what was already there
        const fresh: NewOrder[] = (data.orders as NewOrder[]).filter((o) => !seen.current.has(o.id));
        if (!fresh.length) return;
        fresh.forEach((o) => seen.current.add(o.id));
        const lead = fresh[fresh.length - 1];
        const title = fresh.length === 1 ? `New order ${lead.orderNumber}` : `${fresh.length} new orders`;
        const body = fresh.length === 1
          ? `${formatPrice(lead.total)} · ${String(lead.paymentMethod || '').toUpperCase()}${lead.customer ? ` · ${lead.customer}` : ''}`
          : fresh.map((o) => `${o.orderNumber} ${formatPrice(o.total)}`).join(', ');
        showToast(`${title}: ${body}`, 6000);
        if (soundRef.current) {
          playChime();
          showDesktopNotification(title, body, `order-${lead.id}`);
        }
        if (document.hidden) {
          unread.current += fresh.length;
          document.title = `(${unread.current}) New order - ${baseTitle.current}`;
        }
        callback.current?.();
      } catch {
        /* try again on the next tick */
      }
    }
    void poll();
    const timer = window.setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', clearBadge);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.title = baseTitle.current;
    };
  }, [active]);
}
