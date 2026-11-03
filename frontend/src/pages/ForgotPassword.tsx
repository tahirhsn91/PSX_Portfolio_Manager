import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
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
 * Request a reset link (issue #139).
 *
 * The confirmation is deliberately the same for every address. The server
 * already refuses to say whether an account exists; saying it here would undo
 * that in the one place an attacker can read.
 */
const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const forgot = useMutation({ mutationFn: (email: string) => authApi.forgotPassword(email) });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    forgot.mutate(values.email, { onSuccess: () => setSent(true) });
  };

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <CardDescription>
          {sent ? 'Check your inbox.' : "We'll email you a link to choose a new password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account exists for that address, we&apos;ve sent a reset link. It works once and
              expires in 60 minutes.
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing arrived? Check your spam folder, then try again in a few minutes.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to={ROUTES.LOGIN}>Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormError>{forgot.error instanceof ApiError ? forgot.error.message : null}</FormError>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'email-error' : undefined}
                {...register('email')}
              />
              {errors.email && (
                <p id="email-error" className="text-xs text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <Button type="submit" className="w-full" loading={forgot.isPending}>
              Send reset link
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
        )}
      </CardContent>
    </Card>
  );
}
