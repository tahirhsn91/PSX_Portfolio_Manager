import { useState } from 'react';
import { startOAuth, useOAuthProviders } from '@/hooks';

/**
 * Provider-gated sign-in buttons (issue #136).
 *
 * Renders exactly the providers the server reports as configured — an
 * unconfigured provider produces no button, never a dead one. The click is a
 * top-level navigation to the proxy, which starts the Authorization Code flow;
 * the browser leaves the app here, so a busy label replaces the normal one until
 * the provider page loads.
 */

const MARKS: Record<string, React.ReactNode> = {
  google: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07Z"
      />
    </svg>
  ),
  stub: (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
};

export function OAuthButtons({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const { data: providers } = useOAuthProviders();
  const [busy, setBusy] = useState<string | null>(null);

  // Nothing configured → nothing rendered, and no divider either.
  if (!providers || providers.length === 0) return null;

  const verb = mode === 'signup' ? 'Sign up with' : 'Continue with';

  return (
    <div className="space-y-2">
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          onClick={() => {
            setBusy(provider.id);
            startOAuth(provider.id);
          }}
          disabled={busy !== null}
          aria-label={`${verb} ${provider.label}`}
          className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-md border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
        >
          {MARKS[provider.id] ?? null}
          <span>{busy === provider.id ? 'Redirecting…' : `${verb} ${provider.label}`}</span>
        </button>
      ))}

      <div className="relative py-2" aria-hidden="true">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-surface px-2 text-xs uppercase tracking-wide text-muted-foreground">
            or
          </span>
        </div>
      </div>
    </div>
  );
}
