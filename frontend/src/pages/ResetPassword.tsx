import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/FormError';
import { ROUTES } from '@/constants';
import { ApiError, authApi } from '@/services';

/**
 * Choose a new password from an emailed link (issue #139).
 *
 * The token is the only authority here: it is single-use, expires in 60 minutes
 * and is checked server-side. A missing or rejected token gets the same answer,
 * so the page never guesses why.
 */
const schema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters').max(200, 'That password is too long'),
    confirm: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'The passwords do not match',
  });

type FormValues = z.infer<typeof schema>;

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);

  const reset = useMutation({
    mutationFn: (values: FormValues) => authApi.resetPassword(token, values.password),
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    reset.mutate(values, { onSuccess: () => setDone(true) });
  };

  if (!token) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold tracking-tight">Reset link missing</h1>
          <CardDescription>This address has no token in it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Open the link from your email exactly as it arrived, or ask for a new one.
          </p>
          <Button asChild variant="outline" className="w-full">
            <Link to={ROUTES.FORGOT_PASSWORD}>Request a new link</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
          <CardDescription>You can sign in with it now.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Every other session on this account has been signed out.
          </p>
          <Button asChild className="w-full">
            <Link to={ROUTES.LOGIN}>Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
        <CardDescription>At least 8 characters. This link works once.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError>{reset.error instanceof ApiError ? reset.error.message : null}</FormError>

          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password && (
              <p id="password-error" className="text-xs text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-describedby={errors.confirm ? 'confirm-error' : undefined}
              {...register('confirm')}
            />
            {errors.confirm && (
              <p id="confirm-error" className="text-xs text-destructive">
                {errors.confirm.message}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={reset.isPending}>
            Update password
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            <Link
              to={ROUTES.LOGIN}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
