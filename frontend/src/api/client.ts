import axios from 'axios';

const SESSION_KEY = 'sbh_session_id';
const LEGACY_TOKEN_KEY = 'sbh_token';
/**
 * Always call the API on the same origin: the Vite proxy in development, the Vercel rewrite
 * (frontend/vercel.json) in production on any domain, and Express itself when served from Render.
 * This keeps login cookies first-party and needs no CORS entry for custom domains.
 * VITE_API_URL is intentionally ignored so a stale host setting can never break a domain.
 */
function resolveApiBase() {
  return '/api';
}

/** Clear any pre-cookie JWT left in localStorage (XSS surface). */
export function clearAuthToken() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const api = axios.create({
  baseURL: resolveApiBase(),
  withCredentials: true,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  config.headers.set('x-session-id', getOrCreateSessionId());
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type');
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data as { success?: boolean; data?: unknown };
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      response.data = body.data;
    }
    return response;
  },
  (error: { response?: { data?: { error?: string; message?: string } }; message?: string }) => {
    const msg = error.response?.data?.error || error.response?.data?.message || error.message;
    return Promise.reject(new Error(typeof msg === 'string' ? msg : 'Request failed'));
  }
);

export function getSessionId() {
  return getOrCreateSessionId();
}

export default api;
