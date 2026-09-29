/**
 * The account administration API (#4, G4).
 *
 * Every route behind this needs `role = admin`; the gate is on the server, and this
 * client exists so the screens have one place to read the roster from.
 *
 * `create` is the only place a password ever appears in the app: the server generates
 * an account's first one and returns it exactly once, so the admin can hand it over.
 * It is never stored, never re-readable, and the account must replace it at its first
 * sign-in.
 */

import { request } from '../http';
import type { AdminUserSummary } from '@/types';

const BASE = '/api/users';

/** One row of the roster: the account, plus the aggregate the matrix allows. */
export type ManagedUser = AdminUserSummary;

export const usersApi = {
  list: async (query?: string): Promise<ManagedUser[]> => {
    const path = query ? `${BASE}?q=${encodeURIComponent(query)}` : BASE;
    const { users } = await request<{ users: ManagedUser[]; total: number }>(path);
    return users;
  },

  create: async (input: {
    email: string;
    displayName?: string;
    role?: 'admin' | 'user';
  }): Promise<{ user: ManagedUser; firstPassword: string }> => {
    return request<{ user: ManagedUser; firstPassword: string }>(BASE, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  setStatus: async (id: string, isActive: boolean): Promise<ManagedUser> => {
    const { user } = await request<{ user: ManagedUser }>(`${BASE}/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
    return user;
  },

  setRole: async (id: string, role: 'admin' | 'user'): Promise<ManagedUser> => {
    const { user } = await request<{ user: ManagedUser }>(`${BASE}/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    return user;
  },
};
