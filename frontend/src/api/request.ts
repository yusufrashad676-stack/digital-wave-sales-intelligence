import { clearSession, getAccessToken, getRefreshToken, setSession } from './session';

const REFRESH_PATH = '/api/v1/auth/refresh';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
}

async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  let code: string | undefined;
  let message = fallback;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code;
    message = body.error?.message ?? message;
  } catch {
    // keep the generic message when the body is not JSON
  }
  return new ApiError(message, response.status, code);
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  if (refreshInFlight === null) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(REFRESH_PATH, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) {
          return false;
        }
        const body = (await response.json()) as { data?: { accessToken?: string; refreshToken?: string } };
        if (body.data?.accessToken === undefined || body.data.refreshToken === undefined) {
          return false;
        }
        setSession(body.data.accessToken, body.data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

export async function requestJson<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const { auth = true, retryOnUnauthorized = true } = options;

  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (auth) {
    const accessToken = getAccessToken();
    if (accessToken !== null) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  const response = await fetch(path, { ...init, headers });

  if (response.ok) {
    return (await response.json()) as T;
  }

  if (auth && retryOnUnauthorized && response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      const retryHeaders = new Headers(headers);
      const freshToken = getAccessToken();
      if (freshToken !== null) {
        retryHeaders.set('Authorization', `Bearer ${freshToken}`);
      }
      const retryResponse = await fetch(path, { ...init, headers: retryHeaders });
      if (retryResponse.ok) {
        return (await retryResponse.json()) as T;
      }
      throw await toApiError(retryResponse, `فشل الطلب (${retryResponse.status})`);
    }
    // The session could not be recovered: the stored refresh token is invalid,
    // expired, or absent. Clear the bad session so the app routes to login.
    clearSession();
    throw await toApiError(response, 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
  }

  throw await toApiError(response, `فشل الطلب (${response.status})`);
}
