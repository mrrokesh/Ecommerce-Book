import axios from 'axios';

const SESSION_KEY = 'sbh_session_id';

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  config.headers['x-session-id'] = getOrCreateSessionId();
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
