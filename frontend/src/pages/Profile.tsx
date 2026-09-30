import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FormError } from '@/components/auth/FormError';
import { PageHeader } from '@/components/shared';
import { ROUTES } from '@/constants';
import { formatDateTime } from '@/utils';
import { useChangePassword, useLogout, useMe, useUpdateProfile } from '@/hooks';
import { ApiError } from '@/services';

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Your name is required')
    .max(80, 'Keep it under 80 characters'),
  phone: z.string().trim().max(40, 'Keep it under 40 characters'),
  // A free string: the zone list is the platform's to know, and a wrong one is a
  // display preference, not something worth refusing a save over.
  timezone: z.string().trim().max(64, 'Keep it under 64 characters'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(200, 'Keep it under 200 characters'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: 'The passwords do not match',
    path: ['confirmPassword'],
  });

export function Profile() {
  const navigate = useNavigate();
  const { data: user } = useMe();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const [passwordSaved, setPasswordSaved] = useState(false);

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    values: {
      displayName: user?.displayName ?? '',
      phone: user?.phone ?? '',
      timezone: user?.timezone ?? '',
    },
  });

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  if (!user) return null;

  const onSaveProfile = (values: z.infer<typeof profileSchema>) => {
    updateProfile.mutate({
      displayName: values.displayName,
      phone: values.phone || null,
      timezone: values.timezone || null,
    });
  };

  const onChangePassword = (values: z.infer<typeof passwordSchema>) => {
    setPasswordSaved(false);
    changePassword.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () => {
          setPasswordSaved(true);
          passwordForm.reset();
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Your account and its password." />

      {/* A password somebody else chose is the one thing on this page that is
          urgent, so it comes first and stays until it is dealt with. */}
      {user.mustChangePassword && (
        <p
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm"
        >
          You are using a password that was set for you. Choose your own below to continue using the
          app.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Read-only — an administrator manages these.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Role</span>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
              {user.role === 'admin' ? 'Administrator' : 'User'}
            </Badge>
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">Last sign-in</span>
            <span>{formatDateTime(user.lastLoginAt)}</span>
          </div>
          <Separator />
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            loading={logout.isPending}
            onClick={() =>
              logout.mutate(undefined, {
                onSuccess: () => navigate(ROUTES.LOGIN, { replace: true }),
              })
            }
          >
            Sign out
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
          <CardDescription>
            Shown to you alone; nothing here is visible to other accounts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={profileForm.handleSubmit(onSaveProfile)} noValidate className="space-y-4">
            <FormError>
              {updateProfile.error instanceof ApiError ? updateProfile.error.message : null}
            </FormError>

            <div className="space-y-2">
              <Label htmlFor="displayName">Name</Label>
              <Input
                id="displayName"
                autoComplete="name"
                {...profileForm.register('displayName')}
              />
              {profileForm.formState.errors.displayName && (
                <p className="text-xs text-destructive">
                  {profileForm.formState.errors.displayName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" autoComplete="tel" {...profileForm.register('phone')} />
              {profileForm.formState.errors.phone && (
                <p className="text-xs text-destructive">
                  {profileForm.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <Input
                id="timezone"
                placeholder="Asia/Karachi"
                {...profileForm.register('timezone')}
              />
              {profileForm.formState.errors.timezone && (
                <p className="text-xs text-destructive">
                  {profileForm.formState.errors.timezone.message}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" loading={updateProfile.isPending}>
                Save changes
              </Button>
              {updateProfile.isSuccess && (
                <span className="text-xs text-muted-foreground">Saved.</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription>
            Changing it signs out every other device; this one stays signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={passwordForm.handleSubmit(onChangePassword)}
            noValidate
            className="space-y-4"
          >
            <FormError>
              {changePassword.error instanceof ApiError ? changePassword.error.message : null}
            </FormError>
            {passwordSaved && (
              <p className="text-sm text-muted-foreground">Your password has been changed.</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                {...passwordForm.register('currentPassword')}
              />
              {passwordForm.formState.errors.currentPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.currentPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register('newPassword')}
              />
              {passwordForm.formState.errors.newPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.newPassword.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...passwordForm.register('confirmPassword')}
              />
              {passwordForm.formState.errors.confirmPassword && (
                <p className="text-xs text-destructive">
                  {passwordForm.formState.errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" loading={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
