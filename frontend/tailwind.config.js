/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      /*
       * Type. Fira Sans for the interface and Fira Code for figures: this is a
       * data app, and Fira's tabular figures are what make a column of rupees
       * line up. Both are self-hosted (see src/main.tsx), so loading the app
       * makes no third-party request.
       */
      fontFamily: {
        sans: [
          '"Fira Sans"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
        mono: [
          '"Fira Code"',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Consolas',
          '"Liberation Mono"',
          'monospace',
        ],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        /* Surfaces: canvas -> card -> inset -> overlay. */
        surface: {
          DEFAULT: 'hsl(var(--surface))',
          '2': 'hsl(var(--surface-2))',
        },
        overlay: 'hsl(var(--overlay))',
        /* The dev-only strip's fixed red: one colour in both themes, on purpose. */
        'dev-banner': 'var(--dev-banner-bg)',
        'dev-banner-fg': 'var(--dev-banner-fg)',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          hover: 'hsl(var(--primary-hover))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        /*
         * Money and status. Each family is `DEFAULT` = the figure or icon
         * itself, `light` = the tinted surface it sits on, `dark` = the ink that
         * stays legible on that tint. All six values are CSS variables, so one
         * class is right in both themes — measured, not eyeballed: on the card,
         * light profit 5.69 / loss 6.57 / warning 5.43 / info 5.28, dark 8.39 /
         * 5.83 / 9.66 / 7.53.
         */
        profit: {
          DEFAULT: 'hsl(var(--profit))',
          light: 'hsl(var(--profit-light))',
          dark: 'hsl(var(--profit-dark))',
        },
        loss: {
          DEFAULT: 'hsl(var(--loss))',
          light: 'hsl(var(--loss-light))',
          dark: 'hsl(var(--loss-dark))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          light: 'hsl(var(--warning-light))',
          dark: 'hsl(var(--warning-dark))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          light: 'hsl(var(--info-light))',
          dark: 'hsl(var(--info-dark))',
        },
        // PSX brand mark. Not a UI signal — the exchange's own green, kept for
        // the logo so the brand stays recognisable while green in the interface
        // means "made money" and nothing else.
        psx: {
          green: '#00a651',
          emerald: '#009444',
        },
        // Profit/loss tone ladders for the allocation charts. The values are CSS
        // variables (src/index.css) so one class is right in both themes; `ink` is
        // the colour that stays legible on its own tone, for the in-slice labels.
        // The keys are quoted kebab-case because Tailwind uses a config key verbatim:
        // a `chartProfit` key would generate `fill-chartProfit-1`, which is not the
        // class the chart asks for.
        'chart-profit': {
          1: { DEFAULT: 'var(--chart-profit-1)', ink: 'var(--chart-profit-1-ink)' },
          2: { DEFAULT: 'var(--chart-profit-2)', ink: 'var(--chart-profit-2-ink)' },
          3: { DEFAULT: 'var(--chart-profit-3)', ink: 'var(--chart-profit-3-ink)' },
          4: { DEFAULT: 'var(--chart-profit-4)', ink: 'var(--chart-profit-4-ink)' },
          5: { DEFAULT: 'var(--chart-profit-5)', ink: 'var(--chart-profit-5-ink)' },
        },
        'chart-loss': {
          1: { DEFAULT: 'var(--chart-loss-1)', ink: 'var(--chart-loss-1-ink)' },
          2: { DEFAULT: 'var(--chart-loss-2)', ink: 'var(--chart-loss-2-ink)' },
          3: { DEFAULT: 'var(--chart-loss-3)', ink: 'var(--chart-loss-3-ink)' },
          4: { DEFAULT: 'var(--chart-loss-4)', ink: 'var(--chart-loss-4-ink)' },
          5: { DEFAULT: 'var(--chart-loss-5)', ink: 'var(--chart-loss-5-ink)' },
        },
        'chart-flat': { DEFAULT: 'var(--chart-flat)', ink: 'var(--chart-flat-ink)' },
        /*
         * The category ladder: for a breakdown with no profit/loss signal, where a
         * colour marks a category and nothing else. Deliberately not the profit/loss
         * ladders — alternating green and red on a composition chart would claim a
         * direction the data does not have, and green/red belong to money.
         */
        'chart-cat': {
          1: { DEFAULT: 'var(--chart-cat-1)', ink: 'var(--chart-cat-1-ink)' },
          2: { DEFAULT: 'var(--chart-cat-2)', ink: 'var(--chart-cat-2-ink)' },
          3: { DEFAULT: 'var(--chart-cat-3)', ink: 'var(--chart-cat-3-ink)' },
          4: { DEFAULT: 'var(--chart-cat-4)', ink: 'var(--chart-cat-4-ink)' },
          5: { DEFAULT: 'var(--chart-cat-5)', ink: 'var(--chart-cat-5-ink)' },
          6: { DEFAULT: 'var(--chart-cat-6)', ink: 'var(--chart-cat-6-ink)' },
        },
        // Named series, so a chart never carries a hex of its own. Measured
        // against the card in both themes at >= 3:1, the WCAG bar for a graphic.
        'chart-benchmark': 'var(--chart-benchmark)',
        'chart-volume': 'var(--chart-volume)',
        'chart-buy': 'var(--chart-buy)',
        'chart-support': 'var(--chart-support)',
        'chart-resistance': 'var(--chart-resistance)',
        'chart-neutral': 'var(--chart-neutral)',
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)', // 8px
        md: 'calc(var(--radius) - 2px)', // 10px
        lg: 'var(--radius)', // 12px
        xl: 'calc(var(--radius) + 4px)', // 16px — sheets, dialogs
      },
      /*
       * Elevation. In the light theme a card's height comes from its shadow; in
       * the dark theme shadows all but vanish, so the surface ladder and the
       * border carry it there instead. Same classes in both.
       */
      boxShadow: {
        card: '0 1px 2px 0 rgb(11 18 32 / 0.04), 0 1px 3px 0 rgb(11 18 32 / 0.06)',
        raised: '0 4px 12px -2px rgb(11 18 32 / 0.10), 0 2px 6px -2px rgb(11 18 32 / 0.06)',
        overlay: '0 12px 32px -8px rgb(11 18 32 / 0.24), 0 4px 12px -4px rgb(11 18 32 / 0.12)',
      },
      /*
       * Motion. Three durations and two curves (--motion-* / --ease-* in
       * index.css), so `duration-base` and `ease-standard` read the same
       * everywhere instead of every component inventing its own 200ms.
       */
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
        exit: 'var(--ease-exit)',
      },
      /*
       * Only the keyframes something actually animates: the accordion pair had no
       * call site, so it is gone. `shimmer` is back because the skeleton uses it.
       */
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        shimmer: 'shimmer 2s infinite linear',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
