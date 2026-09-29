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
import { ApiError, request as httpRequest } from '../http';

export { ApiError };

/** Every call here is scoped to the account API; the shared client does the rest. */
const request = <T,>(path: string, init: RequestInit = {}): Promise<T> =>
  httpRequest<T>(`/api/auth${path}`, init);

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
