/**
 * The shared palette.
 *
 * Every colour below is the same value PSX_Scraper carries in its own
 * `frontend/src/theme/tokens.ts` on `develop`, so a screen in either app is built from
 * one palette rather than two that happen to look similar.
 *
 * How these reach the UI here, and why it is two files instead of one:
 *
 *   1. This file is the **definition** — the same shapes and names the scraper uses
 *      (`bg`, `surface`, `up`, `down`, `onSoft`, …), so the two can be read side by side.
 *   2. `src/index.css` holds the same values as CSS custom properties, because this app
 *      is Tailwind rather than MUI: the utilities compile to `hsl(var(--primary))`, and
 *      the variables have to be in the stylesheet rather than applied by JavaScript —
 *      the theme is resolved before the first paint (see the bootstrap in `index.html`),
 *      and a palette applied after mount would flash.
 *   3. `themeTokens.test.ts` reads both and fails if a value here and its variable there
 *      disagree, so "the same colours" is checked rather than claimed.
 *
 * Components never import this file. They use the utilities built from those variables
 * (`bg-primary`, `text-profit`, `fill-chart-profit-2`), which is what keeps a colour in
 * one place. The scraper's own rule — that a component reads the theme, never a literal
 * — holds here in exactly the same way.
 *
 * Deliberately NOT carried over from the scraper's file: `typeScale`, `radius`, `motion`,
 * `layout` and `shadowsFor`. Those are the scraper's MUI theme, and this app has its own
 * answer for each (Tailwind's scale, one `--radius`, two motion curves). Copying values
 * that nothing here reads would create a second place for them to drift from, which is
 * the opposite of the point. Colours are what the two apps share today.
 *
 * Two of this app's variable names differ from the scraper's on purpose, because the
 * words mean different things in a Tailwind/shadcn app — see the notes on `accent` and
 * the trend pair in `index.css`.
 */

/** 'light' | 'dark'. The scraper imports MUI's `PaletteMode`; this app has no MUI. */
export type PaletteMode = 'light' | 'dark';

/** A trend colour ships as a triple so a pill, row or chip can be tinted without losing contrast. */
export interface TrendColors {
  /** Direction colour: up/down value, candle body, delta text. */
  main: string;
  /** Tinted background for soft pills and rows. */
  soft: string;
  /** Text/icon colour that sits on `soft` (verified >= 4.5:1). */
  onSoft: string;
}

export interface SoftColor {
  main: string;
  soft: string;
}

export interface ModeTokens {
  bg: string;
  surface: string;
  surfaceElevated: string;
  sunken: string;
  border: string;
  /** Stronger outline for input/control boundaries (>= 3:1, WCAG 1.4.11). */
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  primaryActive: string;
  onPrimary: string;
  primarySoft: string;
  onPrimarySoft: string;
  up: TrendColors;
  down: TrendColors;
  warning: SoftColor;
  info: SoftColor;
  accent: SoftColor;
  focusRing: string;
  /** Alpha used by dividers/hover washes that must not fight the surface. */
  hoverWash: string;
  selectedWash: string;
}

export const lightTokens: ModeTokens = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  sunken: '#EDF1F6',
  border: '#D8E0E9',
  borderStrong: '#7B8A9C', // 3.52:1 on white
  text: '#0F172A', // 17.85:1 on surface
  textSecondary: '#4A5A6E', // 7.05:1
  textMuted: '#5A6A7D', // 5.54:1
  primary: '#0B7A50', // 5.37:1 against white text
  primaryHover: '#096440',
  primaryActive: '#075435',
  onPrimary: '#FFFFFF',
  primarySoft: '#E3F3EB',
  onPrimarySoft: '#146C34', // 5.67:1 on primarySoft
  up: { main: '#15803D', soft: '#E7F6EC', onSoft: '#146C34' }, // 5.02:1 / 5.83:1
  down: { main: '#C81E1E', soft: '#FDECEC', onSoft: '#A31515' }, // 5.74:1 / 6.87:1
  warning: { main: '#B45309', soft: '#FDF3E7' }, // 5.02:1
  info: { main: '#0B5FA5', soft: '#E8F1FA' }, // 6.57:1
  accent: { main: '#B45309', soft: '#FDF3E7' },
  focusRing: '#0B7A50', // 5.00:1 against the light background
  hoverWash: 'rgba(15, 23, 42, 0.04)',
  selectedWash: 'rgba(11, 122, 80, 0.08)',
};

export const darkTokens: ModeTokens = {
  bg: '#0B1220',
  surface: '#131C2E',
  surfaceElevated: '#1A2438',
  sunken: '#070C16',
  border: '#2E3D57', // hairline separator
  borderStrong: '#7C8BA0', // 4.91:1 on surface (>= 3:1 for control outlines)
  text: '#E8EEF8', // 14.61:1 on surface
  textSecondary: '#A9B6C9', // 8.29:1
  textMuted: '#7C8BA0', // 4.91:1
  primary: '#34D399', // 8.86:1 as text on surface
  primaryHover: '#4BE0AC',
  primaryActive: '#22C58A',
  onPrimary: '#04231A', // 8.67:1 on primary
  primarySoft: '#10291D',
  onPrimarySoft: '#7CE3B0', // 9.93:1 on primarySoft
  up: { main: '#4ADE80', soft: '#10291D', onSoft: '#86EFAC' }, // 9.77:1 / 11.02:1
  down: { main: '#F87171', soft: '#2A1113', onSoft: '#FCA5A5' }, // 6.16:1 / 9.31:1
  warning: { main: '#FBBF24', soft: '#2E2410' }, // 10.20:1
  info: { main: '#60A5FA', soft: '#12243B' }, // 6.70:1
  accent: { main: '#F59E0B', soft: '#2E2410' },
  focusRing: '#34D399', // 9.74:1 against the dark background
  hoverWash: 'rgba(232, 238, 248, 0.06)',
  selectedWash: 'rgba(52, 211, 153, 0.12)',
};

export const tokensFor = (mode: PaletteMode): ModeTokens => (mode === 'dark' ? darkTokens : lightTokens);

/**
 * The one colour outside the tokens above, and deliberate in both apps: the
 * dev-environment banner. Red, never restyled, so anyone looking at a screen knows
 * instantly they are not on production. `--dev-banner-bg` in `index.css` carries it.
 */
export const devBanner = { background: '#C62828', text: '#FFFFFF' } as const;
