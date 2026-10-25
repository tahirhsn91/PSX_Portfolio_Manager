# UI/UX improvement programme — progress

Branch: `feat/ui-ux-phases-2-10` · Audit: [`docs/ux-audit.md`](./ux-audit.md) · Started 2026-10-25

Resume rule: read this file and `git log` on the branch before redoing anything. A phase marked **Completed** below has been implemented and verified; do not repeat it.

| # | Phase | Status |
|---|---|---|
| 1 | UX audit & user research | **Completed** (merged `4a9adda`, `docs/ux-audit.md`) |
| 2 | UI/UX design improvements | **Completed** |
| 3 | Design system & reusable components | **Completed** |
| 4 | Responsive design | **Completed** |
| 5 | Dashboard & data visualisation | **Completed** |
| 6 | Interaction design & feedback | **Completed** |
| 7 | Accessibility | **Completed** |
| 8 | Frontend performance | **Completed** |
| 9 | Usability testing | **Completed** |
| 10 | Final QA | **Completed** |

---

## Phase 2 — UI/UX design improvements

**Status:** Completed 2026-10-25.

**Audit findings addressed:** P0 1–4, P3 14; plus the clutter item in the Data card. No restyle — every change is a finding from the audit.

**Changes**
- `pages/Dashboard.tsx` — the store's `isLoading`, `loaded` and `error` are now read. Three distinct screens replace the single "No portfolios yet" fallback: error (with retry), first-load skeleton, and genuine empty. Each keeps the `<h1>`.
- `pages/Watchlist.tsx` — query now exposes `isLoading` / `isError` / `refetch`; skeleton rows while loading, `ErrorState` with retry on failure, empty state only when the list really is empty.
- `pages/Alerts.tsx` — same treatment for the alert list; the create form stays visible in every state.
- `pages/Settings.tsx` — page description no longer says "the data this browser holds"; "Clear all data" body copy and its confirmation now say **account / every device**, matching what `clearAll()` actually does; the browser-storage percentage meter (a meaningless `2 KB / 5 MB (0%)` bar for the settings blob) is replaced by one sentence about what is stored where.
- `pages/Portfolios.tsx` — removed the pre-migration `localStorage` read-probe, its error state, retry and `STORAGE_KEYS` usage. A legacy corrupt key can no longer make a server-backed list report "browser storage is damaged". The legacy-import path in Settings is untouched.
- `pages/Profile.tsx` — `return null` while `useMe()` loads replaced by a heading-preserving skeleton.

**Verification**
- `npx tsc -b` → exit 0.
- `npm test` → **171/171 tests, 19 files**, 36.5 s.
- `npm run build` → run at the end of Phase 3 (no build-affecting change yet).

**Outstanding:** none. The error states added here are exercised for real in Phase 9 by aborting `/api/portfolios`, `/api/watchlist` and `/api/alerts` in the browser.

---

## Phase 3 — Design system and reusable components

**Status:** Completed 2026-10-25.

**Audit findings addressed:** P1 5, 6, 7, 16 (all 19 undersized controls) and the dropdown/focus-ring inconsistency in P3 15.

**Changes — primitives first, then call sites, so future screens inherit the fix**
- `components/ui/input.tsx`, `components/ui/select.tsx` — `h-10` → `h-11` (44 px). This alone fixes 45 of the 54 input call sites that never overrode the height, plus every `SelectTrigger`.
- `components/ui/select.tsx` — `SelectItem` now has `min-h-11` and `py-2`: dropdown rows were 32 px.
- `components/ui/tabs.tsx` — the `segmented` variant drops its `h-10` override and inherits `h-11`; the two comments documenting the old heights corrected.
- `components/ui/switch.tsx` — keeps the 24 px pill (a 44 px pill looks wrong in a row) but gets a 44 px hit area via an `::after` overlay; WCAG 2.5.8 needs 24×24 and this is now 44 tall.
- `components/ui/dialog.tsx` — `max-h-[calc(100dvh-2rem)]`, `overflow-y-auto` and a 12 px gutter on narrow screens, so a long form cannot run off a short phone.
- Call sites normalised: `NotificationBell` actions (36 → 44), `AdminUsers` delete/suspend (32×32 → 44×44 by dropping the `h-8 w-8` override so `size="icon"` applies), `WithholdingToggle` chips (36 → 44), Dividends CTA link (16 px tall → `min-h-11`), Dividends/Alerts/Planner selects and buttons (40 → 44), `TargetAllocation` threshold input (36 → 44), `DividendCalendar` day cells (40 → 44), `ExpectedDividendsCard` "View" link (`min-h-9` → `min-h-11`), Planner charges row (whole row is now the switch's `<label>`).
- Native `<select>` elements keep the OS picker on mobile (deliberate) but now carry the primitive's `focus-visible` ring, so keyboard focus looks the same everywhere.

**Verification**
- Live probe at 390 px over `/login, /settings, /planner, /dividends, /alerts`: **0 undersized form controls** (previously 19 distinct). The only remaining sub-44 boxes are the dev-only TanStack Query devtools button (not in the production bundle), the 1×1 skip link (visually hidden until focused), and the 44×24 switch pill whose hit area is now 44 px via the pseudo-element.
- `npx tsc -b` → 0 · `npm test` → 171/171 · `npm run build` → success.

---

## Phase 4 — Responsive design

**Status:** Completed 2026-10-25.

**Audit findings addressed:** P2 13 (unannounced horizontal scroll on the portfolio tab strip), plus gaps the 390 px audit could not see.

**Measured first, then changed**
- New sweep at **320, 375 and 768 px** across `/dashboard, /portfolios, /dividends, /planner, /watchlist, /alerts, /settings, /profile, /admin/users, /portfolios/:id, /portfolios/:id/stocks/:symbol`: `document.scrollWidth - clientWidth = 0` and 0 clipped elements on every route at every width, before any change. The portfolio detail tab strip was the one real failure: `scrollWidth 798` inside `clientWidth 288` at 320 px — 510 px of navigation hidden with no cue.

**Changes**
- `pages/PortfolioDetail.tsx` — the tab strip keeps its horizontal scroll (eight sections cannot become eight rows on a phone) but now carries an edge mask that fades the cut-off side, measured with a `ResizeObserver` + `scroll` handler and lifted at each end. Mounted via a callback ref, because the strip only exists after the portfolio request resolves. `aria-label="Portfolio sections"` added.
- `components/ui/dialog.tsx` — viewport-height cap and internal scrolling (see Phase 3), so dialogs opened from mobile rows stay inside the screen.

**Verification**
- `npx tsc -b` → 0 · `npm test` → 171/171 · `npm run build` → success.
- Live check at 390 px: computed `mask-image` is the end-fade at rest, both-ends mid-scroll, and start-fade once the strip is scrolled to its end.

---

## Phase 5 — Dashboard and data visualisation

**Status:** Completed 2026-10-25. **No calculation was changed** — every edit is a label, a unit or a caption.

**Audit findings addressed:** "values, units, periods and comparisons are clear" (the value band's change had no stated basis; charts did not state their currency; the price chart's axis is zoomed with nothing saying so).

**Changes**
- `components/shared/MetricBand.tsx` — the change object takes an optional `label`, rendered before the figure. A "+PKR 12,345 (+8.2%)" with no basis is a guessing game.
- `pages/Dashboard.tsx`, `pages/PortfolioDetail.tsx` — both bands now read **"since purchase"**.
- `PortfolioValueChart` — aria-label and summary caption state **PKR**.
- `AllocationPieChart` — summary caption says what the percentages are a share *of* ("share of portfolio value").
- `StockPriceChart` — title and aria-label state PKR, and a line under the summary says the price axis is zoomed to the window, not zero-based, so its slope is not comparable to a zero-based chart.

**Verification:** `tsc` 0 · 171/171 tests · build OK. `git diff` touches no file under `utils/`, `hooks/usePortfolioMetrics`, `store/portfolioStore` or any calculation module.

---

## Phase 6 — Interaction design and user feedback

**Status:** Completed 2026-10-25.

**Changes**
- New `components/shared/ConfirmDialog.tsx` — one confirmation surface built on the existing Dialog primitive. Cancel takes the initial focus, the confirm button shows a spinner and cannot be clicked twice, and `window.confirm` is gone from the app.
- `pages/Portfolios.tsx` — delete now opens that dialog with the portfolio named, the consequence spelled out, and a pending state.
- `pages/AdminUsers.tsx` — suspend and role-change open the same dialog (reactivate and other non-destructive actions still run immediately). The existing two-step permanent-delete dialog is untouched.
- `pages/Alerts.tsx` — delete goes through the dialog; pause/resume and delete buttons carry per-row `loading`, so a double tap cannot fire twice; both mutations now report success and failure through the notification store (previously silent).
- Verified in the browser: dialog opens with the right title, **focus lands on Cancel**, Escape closes it, **focus returns to the "Actions for Long Term" trigger**, and the portfolio is still listed afterwards.

**Defect found and fixed during this phase:** Escape originally dropped focus on `<body>`, because the dialog recorded the (already unmounted) menu item as its return target. Opening one tick after the menu closes fixes it.

---

## Phase 7 — Accessibility

**Status:** Completed 2026-10-25.

**Automated result:** axe-core 4.10.2, 12 routes × light/dark × 1440/390 = **48 runs → 0 violations**. The first run found five distinct issues:

| axe rule | impact | cause | fix |
|---|---|---|---|
| `aria-valid-attr-value` | critical | 2 `Tabs` used as toggle switches had no `TabsContent`, so `aria-controls` pointed at nothing | new `SegmentedControl` (`role="group"` + `aria-pressed`) in Portfolios and Settings |
| `select-name` | critical | the two alert `<select>`s had labels with no `for`/`id` | `id` + `htmlFor` on both, and on the threshold input |
| `heading-order` | moderate | `EmptyState`/`ErrorState` used `<h3>` under the page `<h1>` | `<h2>`; `CardTitle` is `<h2>` too |
| `definition-list` | serious | a `<p>` sat between `<dd>` siblings inside `MetricBand`'s `<dl>` | the hint is a `block` span inside the `<dd>` |
| `svg-img-alt` | serious | recharts marks every pie sector `role="img"` with no title | sectors set to `role="presentation"`; the wrapper label and summary carry the values |

**Other changes**
- `Login` and `Signup` render a real `<h1>` (a page with none was audit finding P1 8).
- Settings section nav and the two planner preset chips move from `text-primary` on `bg-primary/10` (**4.2:1**) to `text-primary-soft-foreground` on `bg-primary-soft` (**4.93:1** light, 8.99 dark — the documented token pair).
- `Signup` fields get `aria-invalid` / `aria-describedby` pointing at their error text, matching what `Login` already did.
- Six data tables got accessible names (`aria-label`), joining the one that already had a `<caption>`.
- The auth "Checking your session…" screen now has a `<main>` and an `<h1>`; it previously had neither, and the missing landmark was real (axe caught it during a slow `/auth/me`).
- Keyboard pass: skip link is the first Tab stop and moves focus to `#main`; focused buttons draw a 2 px ring; a dialog traps all 8 Tabs and Escape closes it.

**Limitations:** no screen-reader (NVDA/VoiceOver) session was run, and axe passing is not a WCAG conformance claim. Judgement-dependent criteria (2.4.6 headings/labels, 1.4.3 contrast on the chart ink, 3.3.1 error identification across every form) were reviewed by inspection, not by a human auditor.

---

## Phase 8 — Frontend performance

**Status:** Completed 2026-10-25. No new dependency.

**Baseline (build before this phase):** entry `index-*.js` **1,091.21 kB / 323.08 kB gzip**, plus a 445 kB recharts chunk, and Vite's ">500 kB" warning fired on every build.

**Change 1 — route-level code splitting.** Every signed-in page is `React.lazy`; the shell keeps a `Suspense` skeleton so the nav and header never unmount. Signed-out pages stay eager.

**Change 2 — real vendor chunks.** `manualChunks` moved from an object listing `react`/`react-dom` to a function over module ids. The old form produced a **0.04 kB** react chunk and left React in the entry, because the code arrives through `react/jsx-runtime` and `react-dom/client`.

**Final:**

| chunk | before | after | gzip after |
|---|---|---|---|
| entry `index` | 1,091.21 kB | **199.44 kB** | **58.22 kB** |
| react | 0.04 kB (broken) | 223.80 kB | 69.49 kB |
| charts | 445.48 kB | 445.48 kB | 118.10 kB |
| motion | in entry | 163.29 kB | 55.47 kB |
| radix | in entry | 150.83 kB | 47.59 kB |
| PortfolioDetail (lazy) | in entry | 134.20 kB | 35.53 kB |

Entry is **82% smaller raw and 82% smaller gzipped**; the >500 kB warning is gone. Vendor chunks keep their hash across app deploys, so a page change no longer invalidates React or recharts.

**Not measured:** runtime LCP/INP. The dev stack is not the production server (on-demand compilation, HMR), so a timing taken here would not be comparable to production; bundle size is the comparable measurement. No list virtualisation was added — the largest table in this account is a handful of rows, and virtualising it would be premature.

---

## Phase 9 — Usability testing

**Status:** Completed 2026-10-25. Method: browser automation against the running dev stack, read-only (no scenario creates, edits or deletes data). **No real users participated.**

| # | Journey | Expected | Result |
|---|---|---|---|
| S1 | 11 signed-in routes at 390 px | every route has an `<h1>`, no horizontal overflow | **pass** (11/11) |
| S1b | same crawl | no uncaught page errors | **pass** (0) |
| S2 | dashboard with `/api/portfolios` delayed 4 s | busy state, never "No portfolios yet" | **pass** |
| S3 | watchlist with the request aborted | error state naming the failure, not "no symbols" | **pass** |
| S3b | retry once the request recovers | error clears, list renders | **pass** |
| S4 | search "Long" on Portfolios | the visible count responds | **pass** |
| S5 | open the sort control | listbox with 5 options | **pass** |
| S6 | next month on the dividend calendar | October 2026 → November 2026 | **pass** |
| S7 | tap Alerts in the 390 px bottom bar | `/alerts` with its heading | **pass** |
| S8 | submit an empty sign-in form | email `aria-invalid`, error linked, stays on /login | **pass** |

**10/10 on the final run.** Two earlier red results were faults in the test script, not the app (a hidden mobile sort button was targeted by aria-label instead of the visible combobox; the bottom bar legitimately has five destinations and Watchlist is not one of them). One real defect surfaced and was fixed in Phase 6 (dialog focus restore). Dev-server on-demand compilation made S1 flaky at a 3 s settle; 5 s is used.

---

## Phase 10 — Final quality assurance

**Status:** Completed 2026-10-25.

| Check | Command | Result |
|---|---|---|
| Types | `npx tsc -b` | **0 errors** |
| Unit tests | `npm test` | **171/171 passed, 19 files** |
| Production build | `npm run build` | **success**, no >500 kB warning |
| Lint | `npm run lint` | **2 errors, 10 warnings** — all pre-existing in `store/marketStore.ts` (lines 74, 83), a file this branch does not touch |
| Accessibility | axe over 48 route/theme/width combinations | **0 violations** |
| Routes | automated crawl of 11 signed-in + 2 signed-out | all render, headings present, no uncaught errors |
| Responsive | 320 / 375 / 768 / 390 / 1440 | no document overflow, no clipped controls |
| States | loading, empty, error, success, validation | exercised in S2, S3, S3b, S8 and the existing empty states |
| Debug leftovers | `console.log` / `debugger` in `src` | none |
| Dependencies | `package.json` | unchanged — no package added |

**Known limitations and unverified areas**
1. Two pre-existing ESLint errors in `store/marketStore.ts` (a ternary used as a statement; an intentionally-unused destructured key). Left untouched — out of scope for a UI/UX branch.
2. No screen-reader pass (NVDA/VoiceOver); axe is automated only.
3. No production LCP/INP measurement — the dev server is not comparable.
4. Colour contrast was verified on the measured token pairs and by axe, not by a human auditor.
5. Empty and error states for `StockDetail` under a dead feed were not induced individually; the same `ErrorState`/`EmptyState` components they use are covered on other routes.
6. The two-step permanent-account delete in Admin users keeps its own dialog (deliberately different: it needs a typed confirmation).



---
