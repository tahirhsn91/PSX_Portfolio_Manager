/**
 * The account, as the proxy describes it. Mirrors `serializeUser()` in
 * `backend/services/users.js` — the password hash is never part of this shape and
 * must never become part of it.
 */

export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  /** True until the account has replaced the password someone else chose for it. */
  mustChangePassword: boolean;
  phone: string | null;
  timezone: string | null;
  preferences: Record<string, unknown>;
  createdAt: string;
  lastSeenAt: string | null;
}

/** A row in the admin roster: an account plus what it owns. */
export interface AdminUserSummary extends AuthUser {
  portfolioCount: number;
}
