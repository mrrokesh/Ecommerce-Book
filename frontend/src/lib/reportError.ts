/** Best-effort client error reporter → POST /api/errors/report (no auth).
 * Stores technical failures only — not form validation or expected business 4xx.
 */

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

/** Form / field / expected-input noise — never send these to site_errors. */
const LOGICAL_NOISE =
  /\b(this field is required|field is required|please (enter|choose|select|provide|fix)|must be|must match|too (short|long)|at least \d|at most \d|validation (failed|error)|form field|invalid (phone|mobile|email|pincode|pin code|password|otp|name|address|number|format|value|input)|enter a valid|password must|confirm password|otp|captcha|already (exists|taken|registered)|not available|out of stock|coupon (invalid|expired|not)|insufficient (stock|balance|funds))\b/i;

export function isLogicalClientNoise(message: string, status?: number) {
  if (status != null && status >= 400 && status < 500) return true;
  const m = String(message || '').trim();
  if (!m) return true;
  if (LOGICAL_NOISE.test(m)) return true;
  // Short UI hint strings without a stack are almost always validation copy
  if (m.length < 80 && !/\b(TypeError|ReferenceError|SyntaxError|RangeError|URIError|NetworkError|Internal server|ECONN|ETIMEDOUT|failed to fetch)\b/i.test(m)) {
    if (/^(please |this field|enter a |choose |select )/i.test(m)) return true;
  }
  return false;
}

export function reportClientError(payload: ReportPayload) {
  try {
    const message = String(payload.message || 'Unknown error').slice(0, 2000);
    if (isLogicalClientNoise(message)) return;

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

function messageFromConsoleArgs(args: unknown[]) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (typeof a === 'string') return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .filter(Boolean)
    .join(' ')
    .slice(0, 2000);
}

function stackFromConsoleArgs(args: unknown[]) {
  const err = args.find((a) => a instanceof Error) as Error | undefined;
  return err?.stack;
}

/** Install runtime, promise, resource, and console.error/warn reporters once. */
export function installGlobalErrorReporting() {
  if ((installGlobalErrorReporting as { _on?: boolean })._on || typeof window === 'undefined') return;
  (installGlobalErrorReporting as { _on?: boolean })._on = true;

  // Script / runtime errors + failed script/link loads (not images — too noisy)
  window.addEventListener(
    'error',
    (event) => {
      const target = event.target as HTMLElement | null;
      if (target && target !== (window as unknown as EventTarget) && 'tagName' in target) {
        const tag = String(target.tagName || '').toLowerCase();
        if (tag === 'script' || tag === 'link') {
          const src =
            (target as HTMLScriptElement).src ||
            (target as HTMLLinkElement).href ||
            '(unknown asset)';
          reportClientError({
            message: `Failed to load ${tag}: ${src}`,
            severity: 'error',
            path: location.pathname,
            url: location.href,
          });
        }
        return; // ignore img/video/audio load failures
      }
      const err = event.error;
      reportClientError({
        message: err?.message || event.message || 'Script error',
        stack: err?.stack,
        path: location.pathname,
        url: location.href,
        line: event.lineno,
        column: event.colno,
      });
    },
    true
  );

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

  const origError = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args: unknown[]) => {
    origError(...args);
    const message = messageFromConsoleArgs(args);
    if (message) {
      reportClientError({
        message,
        stack: stackFromConsoleArgs(args),
        severity: 'error',
        path: location.pathname,
        url: location.href,
      });
    }
  };
  console.warn = (...args: unknown[]) => {
    origWarn(...args);
    const message = messageFromConsoleArgs(args);
    if (message) {
      reportClientError({
        message,
        stack: stackFromConsoleArgs(args),
        severity: 'warning',
        path: location.pathname,
        url: location.href,
      });
    }
  };
}
