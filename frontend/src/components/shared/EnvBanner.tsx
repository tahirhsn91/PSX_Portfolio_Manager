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
      // Hard-coded, theme-independent colours: this must stay red-on-white in
      // both light and dark mode, so it never blends into the app chrome.
      className="shrink-0 bg-[#c62828] px-2 py-[3px] text-center text-[11px] font-bold uppercase leading-[1.6] tracking-[0.08em] text-white"
    >
      {label}
    </div>
  );
}
