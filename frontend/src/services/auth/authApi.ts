/**
 * The account API — sign in, sign out, and the profile behind them.
 *
 * The session is an httpOnly cookie, so every call here sends
 * `credentials: 'include'` and nothing in this file ever touches a token. That is
 * the point: a token the JavaScript can read is a token that an injected script
 * can read too.
 *
 * Errors arrive as `{ error: { code, message } }` from the proxy and are thrown as
 * `ApiError`, so a caller can tell "wrong password" from "account suspended" from
 * "the proxy is down" without parsing a string.
 */

import type { AuthUser } from '@/types';

const PROXY_BASE = (import.meta.env.VITE_PROXY_BASE_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  ''
);

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** The account is fine but cannot act until it changes its password. */
  get needsPasswordChange(): boolean {
    return this.code === 'PASSWORD_CHANGE_REQUIRED';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE}/api/auth${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Cannot reach the server. Check your connection and try again.'
    );
  }

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const envelope = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      res.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Request failed (${res.status})`
    );
  }

  return body as T;
}

export interface ProfilePatch {
  displayName?: string;
  phone?: string | null;
  timezone?: string | null;
  preferences?: Record<string, unknown>;
}

export const authApi = {
  /**
   * The signed-in account, or `null` when nobody is signed in. A 401 is the
   * ordinary answer to "am I signed in?" and must not surface as an error —
   * every other failure is re-thrown.
   */
  async me(): Promise<AuthUser | null> {
    try {
      const { user } = await request<{ user: AuthUser }>('/me');
      return user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async login(email: string, password: string): Promise<AuthUser> {
    const { user } = await request<{ user: AuthUser }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return user;
  },

  async signup(email: string, password: string, displayName: string): Promise<AuthUser> {
    const { user } = await request<{ user: AuthUser }>('/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    return user;
  },

  logout: () => request<{ success: boolean }>('/logout', { method: 'POST' }),

  async updateProfile(patch: ProfilePatch): Promise<AuthUser> {
    const { user } = await request<{ user: AuthUser }>('/me', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    return user;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<AuthUser> {
    const { user } = await request<{ user: AuthUser }>('/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    return user;
  },
};
