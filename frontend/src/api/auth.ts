import { requestJson } from './request';
import { getAccessToken, getRefreshToken } from './session';

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  status: string;
  roles: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

const AUTH_ENDPOINT = '/api/v1/auth';

export async function register(payload: RegisterPayload): Promise<UserProfile> {
  return requestJson<UserProfile>(
    `${AUTH_ENDPOINT}/register`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: false },
  );
}

export async function login(payload: LoginPayload): Promise<TokenResponse> {
  return requestJson<TokenResponse>(
    `${AUTH_ENDPOINT}/login`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: false },
  );
}

export async function fetchMe(): Promise<UserProfile> {
  const response = await requestJson<{ data: UserProfile }>(`${AUTH_ENDPOINT}/me`, { method: 'GET' });
  return response.data;
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  const accessToken = getAccessToken();
  if (refreshToken === null || accessToken === null) {
    return;
  }
  try {
    await requestJson<{ success: boolean }>(`${AUTH_ENDPOINT}/logout`, {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // local logout is authoritative for the MVP
  }
}
