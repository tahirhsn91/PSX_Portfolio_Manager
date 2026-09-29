import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { darkTokens, devBanner, lightTokens, type ModeTokens } from './tokens';

/**
 * The stylesheet, read from disk. Not `import css from '../index.css?raw'`: Vitest routes
 * CSS imports through its own pipeline, which stubs them to an empty string (`css: false`
 * by default) — `?raw` included, so the test would silently compare against nothing.
 */
const css = readFileSync(fileURLToPath(new URL('../index.css', import.meta.url)), 'utf8');

/*
 * The contract behind "both apps use the same colours".
 *
 * `src/theme/tokens.ts` is the definition (the same values PSX_Scraper's own
 * `theme/tokens.ts` carries), and `src/index.css` is what a browser actually paints —
 * the stylesheet has to hold them, because Tailwind's utilities compile to
 * `hsl(var(--x))` and the theme is resolved before the first paint. Two files, one
 * palette, and a risk that they drift the moment somebody edits one of them.
 *
 * So this file reads both and refuses to let them disagree. It is deliberately the only
 * test that parses the stylesheet: `chartTokens.test.tsx` asserts the *behaviour* of the
 * charts against restated values, and points here for the values themselves.
 */

const THEMES = [
  { mode: 'light', selector: ':root', tokens: lightTokens },
  { mode: 'dark', selector: '.dark', tokens: darkTokens },
] as const;

/** Every variable that carries a shared palette colour, and where it comes from. */
const PALETTE_MAP: Record<string, string> = {
  '--background': 'bg',
  '--surface': 'surface',
  '--sunken': 'sunken',
  '--surface-elevated': 'surfaceElevated',
  '--border': 'border',
  '--border-strong': 'borderStrong',
  '--text': 'text',
  '--muted-foreground': 'textSecondary',
  '--text-muted': 'textMuted',
  '--primary': 'primary',
  '--primary-hover': 'primaryHover',
  '--primary-active': 'primaryActive',
  '--primary-foreground': 'onPrimary',
  '--primary-soft': 'primarySoft',
  '--on-primary-soft': 'onPrimarySoft',
  '--profit': 'up.main',
  '--profit-light': 'up.soft',
  '--profit-dark': 'up.onSoft',
  '--loss': 'down.main',
  '--loss-light': 'down.soft',
  '--loss-dark': 'down.onSoft',
  '--warning': 'warning.main',
  '--warning-light': 'warning.soft',
  '--info': 'info.main',
  '--info-light': 'info.soft',
  '--ring': 'focusRing',
  '--hover-wash': 'hoverWash',
  '--selected-wash': 'selectedWash',
};

/**
 * This app's older names for the same steps, kept because call sites use them. They must
 * be an alias of the palette's variable, never a second copy of its value: a copy is
 * exactly how two apps end up a shade apart.
 */
const ALIAS_MAP: Record<string, string> = {
  '--surface-2': '--sunken',
  '--muted': '--sunken',
  '--overlay': '--surface-elevated',
  '--input': '--border-strong',
  '--secondary': '--sunken',
  '--accent': '--sunken',
};

/**
 * The chart ladders carry the palette's own trend colours as their anchor. Which rung
 * depends on the theme, because each ladder is ordered by lightness and the palette's
 * `main` is a mid-tone: the 2nd rung of the light ladders, the 5th/4th of the dark ones.
 */
const LADDER_ANCHORS = {
  light: {
    '--chart-profit-2': 'up.main',
    '--chart-loss-2': 'down.main',
    '--chart-cat-2': 'info.main',
    '--chart-benchmark': 'info.main',
    '--chart-volume': 'textMuted',
    '--chart-buy': 'warning.main',
    '--chart-support': 'up.main',
    '--chart-resistance': 'down.main',
    '--chart-neutral': 'textSecondary',
    '--chart-flat': 'textMuted',
  },
  dark: {
    '--chart-profit-5': 'up.main',
    '--chart-loss-4': 'down.main',
    '--chart-cat-2': 'info.main',
    '--chart-benchmark': 'info.main',
    '--chart-volume': 'textMuted',
    '--chart-buy': 'warning.main',
    '--chart-support': 'up.main',
    '--chart-resistance': 'down.main',
    '--chart-neutral': 'textSecondary',
    '--chart-flat': 'textMuted',
  },
} as const;

/** The declarations of the first block matching `selector`, as variable -> value. */
function declarations(selector: string): Record<string, string> {
  const pattern = new RegExp(`\\n  ${selector.replace('.', '\\.')} \\{([\\s\\S]*?)\\n  \\}`);
  const match = css.match(pattern);
  if (!match) throw new Error(`no \`${selector}\` block in index.css`);

  const vars: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    // Digits matter: `--surface-2` and every `--chart-profit-1` rung carry one.
    const declaration = line.match(/^\s*(--[a-z0-9-]+):\s*([^;]+);/);
    if (declaration) vars[declaration[1]] = declaration[2].trim();
  }
  return vars;
}

/** Follow `var(--x)` references, so an alias is compared by the colour it lands on. */
function resolve(vars: Record<string, string>, name: string, seen: string[] = []): string {
  const value = vars[name];
  if (value === undefined) throw new Error(`${name} is not declared`);
  if (seen.includes(name)) throw new Error(`${name} is circular: ${seen.join(' -> ')}`);
  const alias = value.match(/^var\((--[a-z-]+)\)$/);
  return alias ? resolve(vars, alias[1], [...seen, name]) : value;
}

function valueAt(tokens: ModeTokens, path: string): string {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Record<string, unknown>)[key], tokens) as string;
}

const HEX = /^#([0-9a-f]{6})$/i;
const HSL = /^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/;

function hexToHsl(hex: string): [number, number, number] {
  const match = hex.match(HEX);
  if (!match) throw new Error(`${hex} is not a hex colour`);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = ((max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) % 360;
  return [h, s * 100, l * 100];
}

/** The stylesheet keeps HSL components rounded to one decimal; a tenth is 0.05. */
const ROUNDING = 0.2;

function expectSameColour(actual: string, expected: string, label: string) {
  if (expected.startsWith('#')) {
    const hsl = actual.match(HSL);
    if (!hsl) {
      // A hex against a hex (the dev strip) — compare as written.
      expect(actual.toLowerCase(), label).toBe(expected.toLowerCase());
      return;
    }
    const [h, s, l] = hexToHsl(expected);
    if (s > 0.5) expect(Math.abs(Number(hsl[1]) - h), `${label} hue`).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(Number(hsl[2]) - s), `${label} saturation`).toBeLessThanOrEqual(ROUNDING);
    expect(Math.abs(Number(hsl[3]) - l), `${label} lightness`).toBeLessThanOrEqual(ROUNDING);
    return;
  }
  expect(actual.toLowerCase(), label).toBe(expected.toLowerCase());
}

function luminance(hex: string): number {
  const match = hex.match(HEX);
  if (!match) throw new Error(`${hex} is not a hex colour`);
  const channel = (c: number) => {
    const v = parseInt(match[1].slice(c, c + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('the shared palette', () => {
  it('carries the same colour in index.css as in tokens.ts, both themes', () => {
    for (const { mode, selector, tokens } of THEMES) {
      const vars = declarations(selector);
      for (const [name, path] of Object.entries(PALETTE_MAP)) {
        expectSameColour(resolve(vars, name), valueAt(tokens, path), `${name} (${mode}) vs ${path}`);
      }
    }
  });

  it('aliases this app\u2019s older variable names onto the palette\u2019s step, never a copy', () => {
    for (const { selector } of THEMES) {
      const vars = declarations(selector);
      for (const [name, target] of Object.entries(ALIAS_MAP)) {
        expect(vars[name], `${name} (${selector})`).toBe(`var(${target})`);
      }
    }
  });

  it('anchors each chart ladder on the palette rather than a colour of its own', () => {
    for (const { mode } of THEMES) {
      const vars = declarations(mode === 'light' ? ':root' : '.dark');
      const tokens = mode === 'light' ? lightTokens : darkTokens;
      for (const [name, path] of Object.entries(LADDER_ANCHORS[mode])) {
        const ladderValue = vars[name];
        expect(ladderValue, `${name} (${mode}) missing`).toBeDefined();
        expectSameColour(ladderValue.toLowerCase(), valueAt(tokens, path), `${name} (${mode}) vs ${path}`);
      }
    }
  });

  it('keeps the dev strip the one red both apps already shared', () => {
    expectSameColour(declarations(':root')['--dev-banner-bg'], devBanner.background, '--dev-banner-bg');
    // And the dark block deliberately does not redeclare it: one red in both themes.
    expect(declarations('.dark')['--dev-banner-bg']).toBeUndefined();
  });

  it('meets the contrast the palette\u2019s own comments claim', () => {
    for (const { mode, tokens } of THEMES) {
      const text = (fg: string, bg: string, need: number, label: string) => {
        const ratio = contrast(fg, bg);
        expect(ratio, `${mode}: ${label} measured ${ratio.toFixed(2)}, needs ${need}`).toBeGreaterThanOrEqual(need);
      };
      text(tokens.text, tokens.surface, 4.5, 'body text on a card');
      text(tokens.textSecondary, tokens.surface, 4.5, 'secondary text on a card');
      text(tokens.textMuted, tokens.surface, 4.5, 'muted text on a card');
      text(tokens.textMuted, tokens.sunken, 4.5, 'muted text on an inset row');
      text(tokens.primary, tokens.surface, 4.5, 'primary as text');
      text(tokens.primary, tokens.bg, 4.5, 'primary on the canvas');
      text(tokens.onPrimary, tokens.primary, 4.5, 'ink on a primary fill');
      text(tokens.onPrimarySoft, tokens.primarySoft, 4.5, 'ink on a primary tint');
      text(tokens.up.main, tokens.surface, 4.5, 'a gain as text');
      text(tokens.down.main, tokens.surface, 4.5, 'a loss as text');
      text(tokens.warning.main, tokens.surface, 4.5, 'a warning as text');
      text(tokens.info.main, tokens.surface, 4.5, 'info as text');
      text(tokens.up.onSoft, tokens.up.soft, 4.5, 'ink on a gain tint');
      text(tokens.down.onSoft, tokens.down.soft, 4.5, 'ink on a loss tint');
      text(tokens.focusRing, tokens.bg, 3, 'the focus ring on the canvas');
      text(tokens.borderStrong, tokens.surface, 3, 'a control outline on a card');
    }
  });
});
