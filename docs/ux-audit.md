# UX audit — Phase 1: UX audit & user research

Measured **2026-10-25** against the running dev stack (`http://169.58.108.61:6200`, proxy `:6201`), commit `b31223a` (develop).

This phase changed **no application code**. Its output is this audit plus the prioritised backlog at the end; implementation starts only when the next phase is approved.

## Method

- **Routes:** 12 signed-in routes (`/dashboard`, `/portfolios`, `/portfolios/:id`, `/portfolios/:id/stocks/:symbol`, `/dividends`, `/watchlist`, `/planner`, `/alerts`, `/settings`, `/profile`, `/admin/users`, 404) and the 2 signed-out pages (`/login`, `/signup`).
- **Viewports:** 390, 768, 1024, 1440 and 1920 px wide.
- **Themes:** light **and** dark, driven through the browser's `prefers-color-scheme` so the app's own `useTheme()` resolves the theme. (Toggling the `.dark` class from the auditor does not work: `useTheme` re-applies the account setting after mount and silently removes it.)
- **Measured per route:** WCAG contrast with alpha compositing up the ancestor chain; touch targets against the app's own 44 px floor; rendered type under 12 px; document **and** element-level horizontal overflow; exactly one `<h1>`; `aria-current`; accessible names on icon-only controls; chart labelling; console errors.
- **Reliability guards:** animations forced off via `prefers-reduced-motion`, and every scroll-reveal is waited on until it has finished painting, so a mid-fade element can never be reported as a contrast failure. Pages are given 2 s + reveal completion before measuring.
- **Session:** a `psx_session` JWT was minted inside the backend for an existing account (`signSession`) and set as a cookie — no password was typed or stored.
- **Baseline:** `tsc -b` clean; `npm test` **171/171 tests, 19 files**.

Two passes were run: 128 page loads for structure/overflow (12 routes × 5 widths × 2 themes + 8 signed-out), then 56 settled passes at 390 px and 1440 px in both themes for contrast, type and touch. The first pass is reported only for structural facts — several data-heavy pages had not finished painting when it measured.

## Scorecard

| Check | Result |
|---|---|
| Exactly one `<h1>` per screen | **12/14 routes pass.** `/login` and `/signup` render **zero** |
| Text contrast (AA) | **1 failure in 56 measurements** — Settings section nav, 4.2:1 |
| Touch targets ≥ 44 px (the app's own rule) | **19 distinct controls fail**; 140 occurrences across viewports |
| Text ≥ 12 px | **20 distinct labels at 11 px**; 54 occurrences |
| Horizontal overflow (document) | **0 px on every route, width and theme** |
| Horizontal overflow (inner elements) | 4 minor cases (max +93 px, clipped by a parent) |
| Icon-only controls with an accessible name | **all pass** |
| `aria-current` on the active destination | **all pass** (both nav surfaces) |
| Charts labelled | **all pass** at wrapper level (`role="group"` + `aria-label`, recharts `accessibilityLayer`) |
| Console / page errors | **none** |
| Content hidden under `prefers-reduced-motion` | **none** |

The design system side of this is genuinely strong: the palette is documented with measured ratios in `frontend/src/index.css`, the shell has one scroll container, every route has one `h1`, and there is no horizontal overflow at any width. What follows is the residue.

## Per-route

`c` = contrast failures, `t` = touch targets under 44 px, `f` = rendered text under 12 px. Worst of light/dark at each width.

| Route | 390 px (c/t/f) | 1440 px (c/t/f) | h1 |
|---|---|---|---|
| Dashboard | 0/1/1 | 0/1/2 | 1 |
| Portfolios | 0/0/0 | 0/0/0 | 1 |
| Portfolio detail | 0/0/0 | 0/0/0 | 1 |
| Stock detail | 0/0/0 | 0/0/0 | 1 |
| Dividends | 0/4/6 | 0/4/13 | 1 |
| Watchlist | 0/0/0 | 0/0/0 | 1 |
| Planner | 0/7/4 | 0/7/4 | 1 |
| Alerts | 0/4/0 | 0/4/0 | 1 |
| Settings | 1/0/0 | 1/0/0 | 1 |
| Profile | 0/6/0 | 0/6/0 | 1 |
| Admin users | 0/7/0 | 0/7/0 | 1 |
| Not found | 0/0/0 | 0/0/0 | 1 |
| Login | 0/2/0 | 0/2/0 | **0** |
| Signup | 0/4/0 | 0/4/0 | **0** |

## Findings, by priority

### P0 — Screens that state something untrue

**1. A failed load looks like "you have no data" on Dashboard, Watchlist and Alerts.**
- `Dashboard.tsx:31` reads `portfolios` from the store but never reads the store's `error` (the store sets it — `portfolioStore.ts:239`). A failed sync therefore falls into the `portfolios.length === 0` branch and renders *"No portfolios yet — create a portfolio to get started"* over data that exists but could not be fetched.
- `Watchlist.tsx:24` and `Alerts.tsx:34` destructure `data = []` and read neither `isLoading` nor `isError`. On every visit the empty state flashes before data arrives, and a failed request leaves it on screen permanently.
- These are the three screens a returning user opens first. The app has `ErrorState` and `EmptyState` primitives; these pages just don't use the former.

**2. "Clear all data" describes browser storage but deletes server-side portfolios.**
- `Settings.tsx:554-556`: *"Clearing removes every portfolio from this browser…"* and the confirmation dialog says *"This deletes N portfolios stored in this browser"*. The action calls `clearAll()`, which deletes the rows on the server. A user who reads this warning will believe their server data is safe.
- The same card correctly says *"Portfolios live in your account on the server"* 80 lines above, so the page contradicts itself.

**3. The Portfolios page still carries a localStorage failure path.**
- `Portfolios.tsx:48-69` — a `readStorageError()` probe plus a `showStorageError` branch that says *"Your saved portfolios could not be read — the browser storage holding them is unavailable or damaged."* Portfolios have not lived in `localStorage` since the server migration; the only thing left there is legacy data the Settings page offers to import. If a legacy key is corrupt, this page shows an error that blames the browser for a server-backed list.

**4. Settings' own description is stale.** `Settings.tsx:268` — *"Appearance, the data this browser holds, and what the app is."* The Data section is about the account's portfolios plus device preferences; nothing meaningful is "held by this browser" any more.

### P1 — Accessibility and touch

**5. Form controls default to 40 px, not the app's 44 px floor.**
`Input` (`components/ui/input.tsx:12`) and `SelectTrigger` (`components/ui/select.tsx:17`) are `h-10`. Only **9 of 54** `<Input` call sites override the height. Measured at 40 px on Login, Signup, Profile (six fields), Alerts (input + two raw `<select>`s), Admin users search, Planner's price field and the Dividends portfolio filter. `button.tsx` explicitly promises every control clears 44 px; inputs are the exception.

**6. Permanent deletion is a 32×32 target.** `AdminUsers.tsx:318,418` — the destructive icon button is `h-8 w-8`. It is the highest-consequence control in the app and the smallest.

**7. Other undersized controls (measured).**

| Control | Size | Where |
|---|---|---|
| "Open a portfolio's dividend calendar" link | 221×16 | Dividends (no `min-h`) |
| Withholding chips 15% / 30% | 52×36 | Dividends |
| Planner switch (raw `<button role="switch">`) | 44×24 | Planner |
| "View" link | 70×36 | Dashboard |
| "Bring it down" / "Bring it up" | 154×40 | Planner |
| Holding selector button | 316×40 | Planner |
| "Mark read" / clear in the notifications popover | 36 px tall (`h-9`) | `NotificationBell.tsx:62,72` |

**8. The signed-out shell has no page heading.** `Login.tsx:47` and `Signup.tsx:63` use `CardTitle`, which renders `<h3>`. Measured `<h1>` count: **0**. There is no document outline on the two screens where someone decides whether to trust the app.

**9. 11 px type where 12 px is the floor.** 20 distinct labels, 54 occurrences, all `text-[11px]`:
- Dividends — "Expected · announced", Next / Withheld / Payouts / Covered, and the table's column heads (Company, Announced, Per share, Shares, Gross, Net, On cost).
- Planner — Shares, Avg price, "Auto-filled from the live PSX quote…", "Brokerage, CVT and other fees", "Fetching the latest quote…".
- Dashboard — "Expected dividends" card label.

**10. One contrast miss.** Settings section nav, active item: `text-primary` on `bg-primary/10` = **4.2:1** (needs 4.5). Light mode only; both widths. Everything else in both themes passes — the palette's own measured table in `index.css` holds up.

**11. Minor:** chart `<svg>` elements carry no `role`/label of their own; the accessible name sits on a `role="group"` wrapper. Recharts' `accessibilityLayer` is enabled on every chart, so this is a refinement, not a failure — confirm with a screen reader before changing it.

### P2 — Consistency

**12. Two confirmation idioms.** `window.confirm` in `Portfolios.tsx:166` (delete) and `AdminUsers.tsx:96,124` (suspend, role change), against themed `Dialog`s in `PortfolioDetail` and `Settings`. The native dialog blocks the page, cannot be styled, and cannot say how much is affected — the same reason Settings moved its own confirmations into dialogs.

**13. Portfolio detail puts 8 tabs in a scrolling strip on mobile.** `PortfolioDetail.tsx:707` — `max-lg:flex-nowrap max-lg:overflow-x-auto no-scrollbar`. Three or four destinations sit off-screen at 390 px with no visible affordance that the strip scrolls (the scrollbar is hidden deliberately). Every other nav/strip in the app wraps instead.

### P3 — Polish

**14.** `Profile.tsx:68` returns `null` while `useMe()` is loading — the page is blank for a beat instead of showing a skeleton.
**15.** Four raw `<select>`s bypass the `Select` primitive: `Dividends.tsx:197`, `Alerts.tsx:106,117`, `HoldingForm.tsx:669`, `DividendCalendar.tsx:385`. They also inherit the 40 px height (finding 5).
**16.** `tabs.tsx` says every trigger is "at least 44px tall (h-11 / h-10)" but the `segmented` variant is `h-10`. Either the comment or the size is wrong; Portfolios already avoids this variant for that reason.

## Not covered by this phase

- Task flows (create portfolio → add holding → read the dashboard), time-to-first-value, and error-recovery paths under a real feed failure.
- Popovers, menus and dialogs opened on demand (only the always-visible surfaces were measured; the notifications popover is covered through its source, not its live render).
- Screen-reader walkthrough, keyboard-only tab order, focus management across route changes.
- User interviews / analytics — this is a measured heuristic audit, not research with users.

## Suggested phase order

1. **P0 copy and states** — findings 1–4. Small, independent of the design system, and they fix screens that currently mislead.
2. **Primitives** — input/select height, segmented tabs, switch, chip and icon-button sizes (findings 5–7, 15, 16), so screens inherit the fix instead of each overriding it.
3. **Signed-out shell** — `h1` and type scale on Login/Signup (finding 8).
4. **Type and colour residue** — 11 px labels (9) and the Settings nav contrast (10).
5. **Consistency** — confirmations (12) and the mobile tab strip (13).

Phase 2 should not begin until this list is agreed.
