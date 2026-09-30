import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { Brand } from './Brand';
import { BRAND_NAME } from '@/constants';

/** The <img> tags a component renders, as raw markup. No DOM needed. */
const imgsOf = (element: React.ReactElement) =>
  [...renderToStaticMarkup(element).matchAll(/<img[^>]*>/g)].map((m) => m[0]);

describe('Brand', () => {
  it('draws the lockup twice, but names it once', () => {
    const imgs = imgsOf(<Brand />);

    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toMatch(/myportfolio365-logo\./);
    expect(imgs[0]).toContain(`alt="${BRAND_NAME}"`);
    // The dark twin is the same picture recoloured. Announcing it would name the product
    // twice to a screen reader, so it is decorative on purpose.
    expect(imgs[1]).toMatch(/myportfolio365-logo-dark\./);
    expect(imgs[1]).toContain('alt=""');
    expect(imgs[1]).toContain('aria-hidden="true"');
  });

  it('draws the mark alone for the 64px collapsed rail', () => {
    const imgs = imgsOf(<Brand mark />);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toContain('src="/brand-mark.png"');
    expect(imgs[0]).toContain(`alt="${BRAND_NAME}"`);
  });

  /*
   * The head used to ask for /psx-logo.svg, which was never in public/ — so the tab had no
   * icon at all, and nothing said so. Every icon the head asks for has to be a real file.
   */
  it('points the head at files that are actually there', () => {
    const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8');
    const hrefs = [...html.matchAll(/<link[^>]+href="(\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((href) => /\.(png|svg|ico)$/.test(href));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const file = new URL('../../../public' + href, import.meta.url);
      expect(existsSync(file), `index.html asks for ${href}, which is not in public/`).toBe(true);
    }
  });
});
