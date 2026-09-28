import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/FormError';
import { ROUTES } from '@/constants';
import { useSignup } from '@/hooks';
import { ApiError } from '@/services';

/**
 * Registering an account is closed by default (``ALLOW_PUBLIC_SIGNUP=false``): the
 * proxy answers 403 and this page explains why. The one exception it makes is the
 * first account of an empty instance, which is how a fresh deployment is claimed —
 * so the page stays reachable and says so.
 */
const schema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(1, 'Your name is required')
      .max(80, 'Keep it under 80 characters'),
    email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Use at least 8 characters')
      .max(200, 'Keep it under 200 characters'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'The passwords do not match',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

export function Signup() {
  const navigate = useNavigate();
  const signup = useSignup();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    signup.mutate(
      { email: values.email, password: values.password, displayName: values.displayName },
      { onSuccess: () => navigate(ROUTES.DASHBOARD, { replace: true }) }
    );
  };

  const failed = signup.error instanceof ApiError ? signup.error : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create an account</CardTitle>
        <CardDescription>
          Accounts are normally created by an administrator. This page is for claiming a new
          instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError>
            {failed?.status === 403
              ? 'Sign-up is closed on this instance — ask an administrator for an account.'
              : failed?.message}
          </FormError>

          <div className="space-y-2">
            <Label htmlFor="displayName">Name</Label>
            <Input id="displayName" autoComplete="name" autoFocus {...register('displayName')} />
            {errors.displayName && (
              <p className="text-xs text-destructive">{errors.displayName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" loading={signup.isPending}>
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link
            to={ROUTES.LOGIN}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
