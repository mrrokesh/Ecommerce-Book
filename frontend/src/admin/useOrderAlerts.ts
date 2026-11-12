import { useEffect, useRef } from 'react';
import api from '../api/client';
import { showToast } from '../components/Toast';
import { askNotificationPermission, notificationsSupported, playChime, showDesktopNotification, unlockAudio } from '../lib/alertSound';
import { formatPrice } from '../utils/format';

type NewOrder = { id: string; orderNumber: string; total: number; paymentMethod: string; customer?: string };

const POLL_MS = 15000;

/**
 * Chime + toast + desktop notification when a customer places an order while the admin is open.
 * Orders that already exist at load are not announced. Checks every 15 seconds (no websockets needed).
 * The timer runs in a Web Worker because browsers slow down ordinary timers in background tabs, so the
 * alert still arrives on time while you are in another tab or another app.
 */

function backgroundTicker(ms: number, tick: () => void): () => void {
  try {
    const src = `setInterval(function(){postMessage(1)}, ${ms});`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const worker = new Worker(url);
    let fallback: number | undefined;
    worker.onmessage = tick;
    // A strict browser policy reports a blocked worker as an error event, not an exception
    worker.onerror = () => {
      worker.terminate();
      if (fallback === undefined) fallback = window.setInterval(tick, ms);
    };
    return () => { worker.terminate(); URL.revokeObjectURL(url); if (fallback !== undefined) window.clearInterval(fallback); };
  } catch {
    const id = window.setInterval(tick, ms); // workers blocked (for example by a strict policy): plain timer
    return () => window.clearInterval(id);
  }
}
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
    const unlock = () => {
      unlockAudio();
      // One-time permission prompt so alerts also show when the browser is behind other apps
      if (soundRef.current && notificationsSupported() && Notification.permission === 'default') void askNotificationPermission();
    };
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
    const stopTicker = backgroundTicker(POLL_MS, () => void poll());
    const catchUp = () => { if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', catchUp);
    window.addEventListener('online', catchUp);
    return () => {
      stopped = true;
      stopTicker();
      document.removeEventListener('visibilitychange', catchUp);
      window.removeEventListener('online', catchUp);
      window.removeEventListener('focus', clearBadge);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.title = baseTitle.current;
    };
  }, [active]);
}
