/** Best-effort client error reporter → POST /api/errors/report (no auth). */

type ReportPayload = {
  message: string;
  stack?: string;
  source?: 'client' | 'admin';
  severity?: 'error' | 'warning';
  path?: string;
  url?: string;
  href?: string;
  line?: number;
  column?: number;
};

let lastKey = '';
let lastAt = 0;

export function reportClientError(payload: ReportPayload) {
  try {
    const message = String(payload.message || 'Unknown error').slice(0, 2000);
    const key = `${payload.source || 'client'}::${message.slice(0, 120)}::${payload.path || location.pathname}`;
    const now = Date.now();
    if (key === lastKey && now - lastAt < 8000) return; // debounce identical bursts
    lastKey = key;
    lastAt = now;

    const body = JSON.stringify({
      message,
      stack: payload.stack ? String(payload.stack).slice(0, 8000) : undefined,
      source: payload.source === 'admin' || location.pathname.startsWith('/admin') ? 'admin' : 'client',
      severity: payload.severity || 'error',
      path: payload.path || location.pathname,
      url: payload.url || location.href,
      href: payload.href || location.href,
      line: payload.line,
      column: payload.column,
    });

    // Prefer sendBeacon so unload / hard crashes still deliver
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon('/api/errors/report', blob)) return;
    }
    void fetch('/api/errors/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined);
  } catch {
    /* never throw from the reporter */
  }
}

let installed = false;

/** Install window.onerror + unhandledrejection once for the SPA. */
export function installGlobalErrorReporting() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', (event) => {
    const err = event.error;
    reportClientError({
      message: err?.message || event.message || 'Script error',
      stack: err?.stack,
      path: location.pathname,
      url: location.href,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection';
    reportClientError({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      path: location.pathname,
      url: location.href,
    });
  });
}
