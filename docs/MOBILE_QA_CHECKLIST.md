# Mobile QA Checklist — Royale Gold Owner Panel

> Brief §25 test matrix + skills-grounded checks. Applies to the existing
> owner panel and to every new Prime Command Center page.
> Skills: `mobile-native` (platform layer), `ui-ux-pro-max` (44px targets,
> no horizontal scroll, bottom nav ≤ 5), `local-design-taste-frontend` +
> `frontend-design` (RG dark/gold flat, Outfit bold amounts),
> `adversarial_ui_verification` (worst case on every view, served build).
>
> Standing owner-panel facts (verified 17 Nov 2026, HEAD `34b8948`):
> bottom dock ≤760px (Home/Games/Play/Promos/Winners — site nav, not owner
> nav); owner page `padding-bottom:96px` so the last card clears the dock;
> pill nav scrolls horizontally; 44px min-height buttons/inputs; 16px input
> font (no iOS zoom); safe-area insets used on dock/header/toasts
> (`src/app/v48.css:139,677,701,727`); `viewport-fit=cover`,
> `theme-color #070812`, no `maximum-scale` (zoom stays available);
> hover styles must be gated behind `(hover:hover) and (pointer:fine)`;
> flat owner cards (transparent, no border). Owner data loads eagerly on
> mount (all tabs) — per-tab lazy loading is still open work.

## 1. Device matrix (brief §25 — test every page at each width)

| Profile | Viewport | Notes |
|---|---|---|
| Small Android | 360 × 800 | Narrowest — worst case for tiles, day strip, tables |
| iPhone SE-style | 375 × 812 | Safe-area top (notch) + home indicator |
| Standard Android | 390 × 844 | **Primary target — Chuks previews on his phone** |
| Large Android | 412 × 915 | |
| Large iPhone | 430 × 932 | |
| Tablet | 768 × 1024 | Dock hides >760px; pill nav still scrolls |
| Laptop | 1366 × 768 | |
| Desktop | 1440 × 900 | |
| Large desktop | 1920 × 1080 | |

## 2. Pages to test (map to current tabs + new Phase 1–5 pages)

Existing: Owner Overview · Finance (Withdrawals, Commission rules,
Commission viewer, Settlement, Ledger, P&L, PayTeller gateway, Wallet
config, Currency settings, Cashier) · Payouts (day strip, per-person cards,
Details expand) · Reports (Audit log, Revenue, RTP, Fraud, BI, Replays,
Anomalies) · Manage (Add admin, All admins, Player search, Games, Agent
hierarchy, Brands) · Engage (Promotions, Announcements, VIP, Loyalty,
Tournaments) · Settings (Platform, KYC/AML, Support, CMS, Risk rules).
New (phases): date-range Overview · payout calendar (month/week/day/list) ·
beneficiary detail (full-screen) · commission center · financial center ·
daily performance · gateway monitoring · reports/exports · notification
center · AI assistant (if built).

## 3. Checks per page (every viewport)

### Layout
- [ ] `scrollWidth <= clientWidth` on every view (record any view where it exceeds).
- [ ] No text clipping: measure the LARGEST element in each strip/row, not a
  smaller sibling (7-figure amounts e.g. GH₵66,200.00, long names, long
  emails, long links — adversarial fixtures first).
- [ ] Tables convert to cards (or horizontal-scroll wrappers) — never a
  desktop table squeezed into a phone.
- [ ] Charts fit width; axis labels not clipped; bars + values readable;
  table/list alternative exists for accessibility.
- [ ] Sticky header/footer overlap: last card clears the fixed dock
  (96px bottom padding); toasts clear it too.
- [ ] Content not hidden behind the bottom navigation at any scroll position.
- [ ] Safe-area insets: content clears notch/Dynamic Island and home indicator
  (dock, header, sheets, toasts).

### Interaction (mobile-native baseline)
- [ ] No stuck hover state after tap (hover gated by capability query).
- [ ] No grey/blue tap flash (`-webkit-tap-highlight-color: transparent` +
  own `:active` state on every tappable element).
- [ ] Tap feels instant (`touch-action: manipulation` on buttons/links;
  feedback on `:active`/pointer-down, not on click/release).
- [ ] Inputs do not zoom the page (font-size ≥ 16px); correct keyboards
  (`inputmode="numeric"` amounts, `type="tel"` phones, `enterkeyhint`).
- [ ] No pull-to-refresh hijack in app scroll containers
  (`overscroll-behavior` rules).
- [ ] Long-press does not select button text (`user-select: none` on
  controls only — never on body/content the user may copy: references,
  amounts, addresses).
- [ ] Touch targets ≥ 44×44px, 8px+ spacing; destructive/payment-confirm
  actions not adjacent to casual navigation.
- [ ] Keyboard open: layout resizes, inputs + sticky action areas stay
  visible; no content trapped under the keyboard.
- [ ] Dropdowns/selects open in a usable position at 360px; date inputs
  usable (native pickers preferred).

### States
- [ ] Loading state per section (skeleton or "Loading…" — never a blank page).
- [ ] Empty states are one honest line ("No withdrawal requests.",
  "Nobody to pay that day.") — never a plausible-looking zero chart.
- [ ] Error states name the problem and the fix; no silent empty page.
- [ ] Animated content visible by default; entrance runs once only when it
  fires (never leaves content hidden).
- [ ] Reduced-motion respected.

### Owner-specific
- [ ] Payouts: day strip scrolls, selected day is filled (not colour-alone —
  label + state), per-person cards show amount + status pill + actions
  without wrapping mid-word at 390px.
- [ ] Beneficiary detail: masked account details by default; reveal is an
  explicit, audited action; full numbers never in activity feeds/exports.
- [ ] Commission: Per-day / rollup sub-tabs switch data (reused instance must
  reload for the new tab — verify, don't assume).
- [ ] Date-range selector: compact on mobile (does not take over the screen);
  changing it updates every date-sensitive figure on the page.
- [ ] KPI tiles: tappable (drill-down) once Phase 1 lands; until then, tiles
  are plain divs — do not present them as links.
- [ ] Currency chips (GHS/NGN) switch every money figure on the page;
  switching back restores the data (verify, don't assume).
- [ ] 7-figure amounts, long admin/player names, long emails: no clipping
  behind hidden overflow (check clipping as well as page scroll).

## 4. Proof rules (adversarial verification)
- Prove the SERVED build by bundle name + searching served chunks for the
  change marker — never by reading source alone.
- Open a fresh tab/link for each proof; use a NEW versioned screenshot
  filename per version (a cached page/image cannot pass as the new build).
- Re-run the FULL scan after every fix — a fix in one view can move the
  fault to another.
- Name what could NOT be proved in the browser (a tap needing a real
  device; a step needing money movement) instead of claiming it proven.
- Real hardware is the bar for: sticky hover, tap highlight, URL-bar `dvh`
  behaviour, input zoom, click delay, overscroll, safe areas, keyboard.
  Emulation cannot reproduce them — say which fixes were verified from code
  and which need Chuks's phone.

## 5. Known current state (17 Nov 2026 — re-check, don't trust)
- Overview at 390px: tiles → activity → 7-day bars → top admins, full page,
  no big empty space (HEAD `34b8948`). NGN (zero data) shows one-line empty
  states + flat all-zero chart.
- Payouts at 390px: strip + per-person cards verified; Details expand shows
  full MoMo/bank numbers (masking gap — Phase 2).
- Finance Commission rules form: fields stack vertically at 390px; Save rule
  sits beside the From field — cramped but functional (pre-existing).
- Owner page has no pagination on any table; long tables scroll the page.
- All sections load eagerly on mount — first paint carries every tab's
  requests (performance follow-up for Phase 1).
- PWA installable (`manifest.ts`, standalone); `sw.js` caches static assets
  only; no push subscription endpoint.
