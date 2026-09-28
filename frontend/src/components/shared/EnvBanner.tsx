/**
 * Red "DEVELOPMENT ENVIRONMENT" strip so a dev build can never be mistaken for
 * production at a glance.
 *
 * The gate is Vite's own build-time flag: `import.meta.env.DEV` is statically
 * replaced with `false` by `vite build`, so the whole component — label string
 * included — is dead-code-eliminated from a production bundle. Verified by
 * grepping the built assets for the label text.
 *
 * Deliberately NOT doing what a runtime escape hatch would do here: an
 * `|| import.meta.env.VITE_SHOW_ENV_BANNER === 'true'` check keeps the branch
 * live in rollup's eyes (import.meta.env is a runtime object), which drags the
 * label string into every production bundle for no benefit.
 */
const label = import.meta.env.VITE_ENV_LABEL ?? 'DEVELOPMENT ENVIRONMENT';

export function EnvBanner() {
  if (!import.meta.env.DEV) return null;

  return (
    <div
      role="status"
      aria-label={label}
      // Fixed colour, theme-independent — see `--dev-banner-bg` in index.css: this
      // must stay the same red in light and dark so it never blends into the chrome.
      className="shrink-0 bg-dev-banner px-2 py-1 text-center text-xs font-bold uppercase leading-[1.6] tracking-[0.08em] text-dev-banner-fg"
    >
      {label}
    </div>
  );
}
