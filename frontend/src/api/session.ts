const ACCESS_TOKEN_KEY = 'dwsi_access_token';
const REFRESH_TOKEN_KEY = 'dwsi_refresh_token';
const SESSION_UPDATED_EVENT = 'dwsi:session-updated';
const SESSION_EXPIRED_EVENT = 'dwsi:session-expired';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setSession(accessToken: string, refreshToken: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  window.dispatchEvent(new CustomEvent<string>(SESSION_UPDATED_EVENT, { detail: accessToken }));
}

export function clearSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

export function onSessionUpdated(listener: (accessToken: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(SESSION_UPDATED_EVENT, handler);
  return () => window.removeEventListener(SESSION_UPDATED_EVENT, handler);
}

export function onSessionExpired(listener: () => void): () => void {
  window.addEventListener(SESSION_EXPIRED_EVENT, listener);
  return () => window.removeEventListener(SESSION_EXPIRED_EVENT, listener);
}
