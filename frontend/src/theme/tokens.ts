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
 * Deliberately NOT carried over from the scraper's file: `nav`, `chart`, `typeScale`,
 * `radius`, `motion`, `layout` and `shadowsFor`. Those are the scraper's MUI theme, and
 * this app has its own answer for each (CSS variables, Tailwind's scale, one `--radius`,
 * two motion curves). Copying values that nothing here reads would create a second place
 * for them to drift from, which is the opposite of the point. Colours are what the two
 * apps share today.
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
  bg: '#F1F1F1',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  sunken: '#F8F8F8',
  border: '#D8D8D8',
  borderStrong: '#757575', // 4.61:1 on white — control outlines answer to 1.4.11
  text: '#333333', // 12.63:1 on surface
  textSecondary: '#666666', // 5.74:1
  textMuted: '#6B6B6B', // 5.33:1
  primary: '#007A42', // 5.44:1 with white text, 4.81:1 as text on the page
  primaryHover: '#00693A',
  primaryActive: '#005C33',
  onPrimary: '#FFFFFF',
  primarySoft: '#EAF7F0',
  onPrimarySoft: '#007A42', // 4.93:1 on primarySoft
  up: { main: '#007A42', soft: '#EAF7F0', onSoft: '#007A42' }, // 5.44 / 4.93
  down: { main: '#D62F35', soft: '#FCEBEC', onSoft: '#A3161B' }, // 4.86 / 6.78
  warning: { main: '#6B4E0A', soft: '#F2E3C1' }, // 7.72:1 on surface, 6.08:1 on the tint
  info: { main: '#666666', soft: '#EFEFEF' }, // 5.74:1 — the scraper reserves grey for neutral info
  accent: { main: '#D6A333', soft: '#F2E3C1' }, // the scraper's gold: a fill and a series colour
  focusRing: '#007A42', // 4.81:1 against the page
  hoverWash: 'rgba(51, 51, 51, 0.04)',
  selectedWash: 'rgba(0, 122, 66, 0.08)',
};

export const darkTokens: ModeTokens = {
  bg: '#161817',
  surface: '#222524',
  surfaceElevated: '#2B2F2D',
  sunken: '#0F1110',
  border: '#3A3F3D', // hairline separator
  borderStrong: '#8A908D', // 4.75:1 on surface (>= 3:1 for control outlines)
  text: '#F1F1F1', // 13.69:1 on surface
  textSecondary: '#C9CCCB', // 9.56:1
  textMuted: '#A8ADAB', // 6.80:1
  primary: '#32CE8A', // 7.61:1 on surface
  primaryHover: '#45D89A',
  primaryActive: '#28B878',
  onPrimary: '#0F2118', // 8.26:1 on primary
  primarySoft: '#1B3328',
  onPrimarySoft: '#7BE7B6', // 8.99:1 on primarySoft
  up: { main: '#32CE8A', soft: '#1B3328', onSoft: '#7BE7B6' }, // 7.61 / 8.99
  down: { main: '#F4747A', soft: '#3A2022', onSoft: '#F9AEB1' }, // 5.61 / 8.31
  warning: { main: '#E0B95C', soft: '#3A2F1C' }, // 8.29:1 on surface
  info: { main: '#A8ADAB', soft: '#2B2F2D' }, // 6.80:1
  accent: { main: '#E0B95C', soft: '#3A2F1C' },
  focusRing: '#45D89A', // 9.81:1 against the page
  hoverWash: 'rgba(241, 241, 241, 0.06)',
  selectedWash: 'rgba(50, 206, 138, 0.16)',
};

export const tokensFor = (mode: PaletteMode): ModeTokens => (mode === 'dark' ? darkTokens : lightTokens);

/**
 * The one colour outside the tokens above, and deliberate in both apps: the
 * dev-environment banner. Red, never restyled, so anyone looking at a screen knows
 * instantly they are not on production. `--dev-banner-bg` in `index.css` carries it.
 */
export const devBanner = { background: '#C62828', text: '#FFFFFF' } as const;
