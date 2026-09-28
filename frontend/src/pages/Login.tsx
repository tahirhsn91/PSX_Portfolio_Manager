import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/FormError';
import { ROUTES } from '@/constants';
import { useLogin } from '@/hooks';
import { ApiError } from '@/services';

// Deliberately no format check on the address: an account exists with whatever
// the server stored, and a client-side regex is a lockout waiting to happen. If the
// pair is wrong, the server says so. Signup does validate, because there the address
// is being created rather than matched.
const schema = z.object({
  email: z.string().min(1, 'Email is required'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Where they were headed before the guard intervened, so signing in resumes it
  // instead of dumping everyone on the dashboard.
  const from = (location.state as { from?: string } | null)?.from ?? ROUTES.DASHBOARD;

  const onSubmit = (values: FormValues) => {
    login.mutate(values, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Sign in</CardTitle>
        <CardDescription>Your portfolios are stored against this account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormError>{login.error instanceof ApiError ? login.error.message : null}</FormError>

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

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
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

          <Button type="submit" className="w-full" loading={login.isPending}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Setting up a new instance?{' '}
          <Link
            to={ROUTES.SIGNUP}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Create its first account
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
