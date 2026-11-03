import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { ArrowRight, Copy, MailCheck } from 'lucide-react';
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
 * Two honest states the first version hid:
 *  - an address with no account is told so when sign-up is open (there is
 *    nothing to protect: anyone can test an address by trying to register);
 *  - a dev instance with no mail provider returns the link in the response
 *    (delivery: 'stub'), and the page shows it instead of claiming an email
 *    was sent that never left the server.
 */
const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type FormValues = z.infer<typeof schema>;

export function ForgotPassword() {
  const [sent, setSent] = useState<{ devResetUrl?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const forgot = useMutation({ mutationFn: (email: string) => authApi.forgotPassword(email) });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = (values: FormValues) => {
    forgot.mutate(values.email, { onSuccess: (data) => setSent(data) });
  };

  const failure = forgot.error instanceof ApiError ? forgot.error : null;
  const unregistered = failure?.code === 'EMAIL_NOT_REGISTERED';

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight">Reset your password</h1>
        <CardDescription>
          {sent?.devResetUrl
            ? 'This instance has no mail provider, so the link is right here.'
            : sent
              ? 'Check your inbox.'
              : "We'll email you a link to choose a new password."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4">
            {sent.devResetUrl ? (
              <div
                className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3"
                data-testid="dev-reset-panel"
              >
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <MailCheck className="h-4 w-4" aria-hidden="true" />
                  No email was sent — this instance has no mail provider configured.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The reset link exists, but only the server log and this panel hold it. Use it to
                  continue; it works once and expires in 60 minutes.
                </p>
                <Button asChild size="sm" className="mt-3 w-full gap-1.5">
                  <a href={sent.devResetUrl} data-testid="dev-reset-link">
                    Open the reset link
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                </Button>
                {typeof navigator !== 'undefined' && navigator.clipboard && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full gap-1.5"
                    onClick={() => copyLink(sent.devResetUrl as string)}
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    {copied ? 'Copied' : 'Copy link'}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                If an account exists for that address, we&apos;ve sent a reset link. It works once
                and expires in 60 minutes.
              </p>
            )}

            {!sent.devResetUrl && (
              <p className="text-sm text-muted-foreground">
                Nothing arrived? Check your spam folder, then try again in a few minutes.
              </p>
            )}
            <Button asChild variant="outline" className="w-full">
              <Link to={ROUTES.LOGIN}>Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormError>{failure?.message ?? null}</FormError>

            {unregistered && (
              <p className="text-sm text-muted-foreground">
                <Link
                  to={ROUTES.SIGNUP}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Create an account
                </Link>{' '}
                with this email, then reset from there.
              </p>
            )}

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
