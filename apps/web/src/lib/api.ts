import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Strip any trailing slash so `${API_URL}/api` can't become `//api` (a silent
// 404-everything misconfig that's baked into the bundle at build time).
const API_URL = ((import.meta.env.VITE_API_URL as string) ?? 'http://localhost:3333').replace(/\/+$/, '');

const ACCESS_KEY = 'cf_access';
const REFRESH_KEY = 'cf_refresh';

export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = tokenStore.access;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
    tokenStore.set(data.accessToken, data.refreshToken);
    return data.accessToken;
  } catch {
    tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const isAuthRoute = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && original && !original._retry && !isAuthRoute) {
      original._retry = true;
      // Dedupe concurrent refreshes through ONE shared promise, cleared only when
      // it settles (in the `.finally`), never per-consumer. Resetting it in each
      // awaiting handler let a 401 arriving a microtask later start a SECOND
      // refresh with the already-rotated token, tripping the backend's reuse
      // detection and logging the user out mid-session.
      refreshing =
        refreshing ??
        performRefresh().finally(() => {
          refreshing = null;
        });
      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      // Refresh failed — clear any stale tokens and bounce to login.
      tokenStore.clear();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

/** Downloads an authenticated endpoint (e.g. a CSV report) as a browser file. */
export async function downloadCsv(path: string, filename: string): Promise<void> {
  const res = await api.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Extracts a human-friendly message from an Axios error. */
export function apiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const msg = (err.response?.data as { message?: string | string[] })?.message;
    if (Array.isArray(msg)) return msg.join(', ');
    if (typeof msg === 'string') return msg;
    return err.message;
  }
  return 'Erro inesperado';
}
