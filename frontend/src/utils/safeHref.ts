/** Render-time guard for URLs that came from the database: http(s) only, otherwise no link. */
export function safeHref(value?: string | null): string | undefined {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
