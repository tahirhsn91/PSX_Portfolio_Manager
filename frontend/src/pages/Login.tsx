import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormError } from '@/components/auth/FormError';
import { OAuthButtons } from '@/components/auth/OAuthButtons';
import { ROUTES } from '@/constants';
import { useLogin } from '@/hooks';
import { ApiError } from '@/services';

/** Provider refusals arrive as `?oauth_error=<code>`; never as a raw provider string. */
const OAUTH_ERRORS: Record<string, string> = {
  cancelled: 'Sign-in was cancelled.',
  state: "We couldn't complete sign-in. Try again.",
  code: "We couldn't complete sign-in. Try again.",
  exchange: "We couldn't complete sign-in. Try again.",
  provider: 'That sign-in method is not available.',
  OAUTH_EMAIL_UNVERIFIED: 'That account has no verified email address.',
  OAUTH_NO_EMAIL: 'That account did not share an email address.',
  SIGNUP_CLOSED: 'Sign-up is closed on this instance — ask an administrator.',
  ACCOUNT_SUSPENDED: 'This account is suspended.',
  OAUTH_ACCOUNT_EXISTS: 'An account with this email already exists — sign in with your password.',
};

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
  const [searchParams] = useSearchParams();
  const login = useLogin();

  // Set by the OAuth callback when it redirects back here.
  const oauthError = searchParams.get('oauth_error');
  const oauthMessage = oauthError
    ? OAUTH_ERRORS[oauthError] ?? "We couldn't complete sign-in. Try again."
    : null;

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
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <CardDescription>Your portfolios are stored against this account.</CardDescription>
      </CardHeader>
      <CardContent>
        {oauthMessage && <FormError>{oauthMessage}</FormError>}

        {/* Buttons above the divider; renders nothing when no provider is configured. */}
        <OAuthButtons mode="signin" />

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
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                to={ROUTES.FORGOT_PASSWORD}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
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
