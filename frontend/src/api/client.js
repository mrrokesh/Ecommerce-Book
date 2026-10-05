import axios from 'axios';

const SESSION_KEY = 'sbh_session_id';
const TOKEN_KEY = 'sbh_token';
const RENDER_API = 'https://ecommerce-book-rbl2.onrender.com/api';

function resolveApiBase() {
  let raw = String(import.meta.env.VITE_API_URL || '').trim();
  if (!raw) {
    return import.meta.env.PROD ? RENDER_API : '/api';
  }
  raw = raw.replace(/\/$/, '');
  if (raw.endsWith('/api')) return raw;
  return `${raw}/api`;
}

let memoryToken = '';

export function getAuthToken() {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    memoryToken = '';
  }
  return memoryToken;
}

export function setAuthToken(token) {
  memoryToken = token || '';
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function clearAuthToken() {
  setAuthToken('');
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
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  config.headers['x-session-id'] = getOrCreateSessionId();
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
      response.data = body.data;
    }
    return response;
  },
  (error) => {
    const msg = error.response?.data?.error || error.response?.data?.message || error.message;
    return Promise.reject(new Error(typeof msg === 'string' ? msg : 'Request failed'));
  }
);

export function getSessionId() {
  return getOrCreateSessionId();
}

export default api;
