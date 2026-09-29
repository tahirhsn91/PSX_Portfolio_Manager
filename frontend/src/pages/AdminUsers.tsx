/**
 * Accounts (an admin's screen).
 *
 * What an admin may do here is deliberately narrow: see who exists, create an
 * account, suspend or reactivate one, and change a role. What is deliberately absent
 * is anything belonging to another person's portfolio — the matrix gives admins
 * aggregates, never contents, and `/api/portfolios` answers from the signed-in
 * account alone, so the numbers in this table are counts, not a way in.
 *
 * The first password is the one secret this screen ever sees. The server generates it
 * and returns it exactly once; it is shown here until the admin dismisses the panel,
 * and it is never retrievable afterwards.
 */

import { useCallback, useEffect, useState } from 'react';
import { Search, ShieldCheck, UserPlus, UserX, UserCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState, PageHeader } from '@/components/shared';
import { useMe } from '@/hooks';
import { useUIStore } from '@/store';
import { usersApi, type ManagedUser } from '@/services/admin';

const formatWhen = (value?: string | null) =>
  value ? new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';

export function AdminUsers() {
  const { data: me } = useMe();
  const addNotification = useUIStore((s) => s.addNotification);

  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // The generated password, held just long enough to hand over.
  const [handover, setHandover] = useState<{ email: string; password: string } | null>(null);

  const [form, setForm] = useState({ email: '', displayName: '', role: 'user' as 'admin' | 'user' });

  const isAdmin = me?.role === 'admin';

  const refresh = useCallback(async (search = '') => {
    setIsLoading(true);
    try {
      setUsers(await usersApi.list(search));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  const handleCreate = async () => {
    try {
      const { user, firstPassword } = await usersApi.create(form);
      setHandover({ email: user.email, password: firstPassword });
      setCreateOpen(false);
      setForm({ email: '', displayName: '', role: 'user' });
      await refresh(query);
      addNotification({ type: 'success', title: 'Account created', message: `${user.email} can sign in once they have the password shown.` });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not create the account',
        message: (err as Error).message,
      });
    }
  };

  const handleStatus = async (user: ManagedUser) => {
    if (user.isActive && !window.confirm(`Suspend ${user.email}? They are signed out of the app until you reactivate them.`)) {
      return;
    }
    setBusyId(user.id);
    try {
      const updated = await usersApi.setStatus(user.id, !user.isActive);
      setUsers((current) => current.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      addNotification({
        type: 'info',
        title: updated.isActive ? `${updated.email} reactivated` : `${updated.email} suspended`,
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Could not change the account status',
        message: (err as Error).message,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRole = async (user: ManagedUser) => {
    const next = user.role === 'admin' ? 'user' : 'admin';
    const warning =
      next === 'admin'
        ? `Make ${user.email} an admin? They will be able to manage accounts.`
        : `Remove admin from ${user.email}? They keep their own portfolios and lose the admin screens.`;
    if (!window.confirm(warning)) return;

    setBusyId(user.id);
    try {
      const updated = await usersApi.setRole(user.id, next);
      setUsers((current) => current.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
      addNotification({ type: 'success', title: `${updated.email} is now ${updated.role}` });
    } catch (err) {
      // The server refuses the last admin and any self-targeting, and says which.
      addNotification({
        type: 'error',
        title: 'Could not change the role',
        message: (err as Error).message,
      });
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<TriangleAlert className="h-6 w-6" />}
          title="Admins only"
          description="This screen manages accounts. Your own account and password are on the profile page."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Accounts"
        description="Who can sign in, what role they hold, and whether they are active. Portfolio contents stay private to their owner."
      />

      {handover && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck aria-hidden="true" className="h-4 w-4 text-primary" />
              Password for {handover.email}
            </CardTitle>
            <CardDescription>
              Hand this over now. It is not stored, cannot be shown again, and must be
              changed the first time they sign in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <code className="block w-full select-all rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              {handover.password}
            </code>
            <Button variant="outline" size="sm" onClick={() => setHandover(null)}>
              I have given it to them
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Accounts</CardTitle>
            <CardDescription>
              {isLoading ? 'Reading…' : `${users.length} account${users.length === 1 ? '' : 's'}`}
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <UserPlus aria-hidden="true" className="mr-2 h-4 w-4" />
            New account
          </Button>
        </CardHeader>

        <CardContent className="space-y-4">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              void refresh(query);
            }}
          >
            <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by email or name"
              className="pl-9"
              aria-label="Search accounts"
            />
          </form>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {!isLoading && users.length === 0 && !error && (
            <p className="py-6 text-center text-sm text-muted-foreground">No accounts match that search.</p>
          )}

          {users.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-semibold">Account</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Role</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Status</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Portfolios</th>
                    <th scope="col" className="py-2 pr-3 font-semibold">Last sign-in</th>
                    <th scope="col" className="py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isSelf = user.id === me?.id;
                    return (
                      <tr key={user.id} className="border-b last:border-0">
                        <td className="py-3 pr-3">
                          <span className="font-medium">{user.email}</span>
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant={user.isActive ? 'secondary' : 'outline'}>
                            {user.isActive ? 'active' : 'suspended'}
                          </Badge>
                          {user.mustChangePassword && (
                            <span className="ml-2 text-xs text-muted-foreground">owes a password change</span>
                          )}
                        </td>
                        <td className="py-3 pr-3 tabular-nums">{user.portfolioCount}</td>
                        <td className="py-3 pr-3 text-muted-foreground">{formatWhen(user.lastLoginAt)}</td>
                        <td className="py-3">
                          {/* Self-targeting is refused by the server; not offering it here
                              keeps the reason out of an error message. */}
                          {!isSelf && (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busyId === user.id}
                                onClick={() => void handleStatus(user)}
                              >
                                {user.isActive ? (
                                  <>
                                    <UserX aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                                    Suspend
                                  </>
                                ) : (
                                  <>
                                    <UserCheck aria-hidden="true" className="mr-1.5 h-3.5 w-3.5" />
                                    Reactivate
                                  </>
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busyId === user.id}
                                onClick={() => void handleRole(user)}
                              >
                                {user.role === 'admin' ? 'Make user' : 'Make admin'}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New account</DialogTitle>
            <DialogDescription>
              The server generates the first password and shows it once. The account must
              change it at first sign-in.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Display name</Label>
              <Input
                id="new-name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Optional — the email is used if left blank"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm({ ...form, role: value as 'admin' | 'user' })}
              >
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User — their own portfolios only</SelectItem>
                  <SelectItem value="admin">Admin — plus this screen</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreate()} disabled={!form.email}>
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
