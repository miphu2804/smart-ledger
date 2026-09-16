# Admin dashboard prototype — AC brief

Status: locked for this prototype. Not a brand/legal source of truth.

Product: **SmartLedger** / Sổ Nghe Lời. Audience: internal ADMIN supporting many small shops. Not a clinic, not Elera.

## Stack (locked)

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (new-york), restyled to tokens below — do not ship default shadcn look
- Phosphor Icons (`@phosphor-icons/react`)
- React Router
- Path: `/Users/miphu/Projects/smart-ledger-admin-dashboard-mvp/frontend`
- Dev: `pnpm dev` on port **5173**
- Env already exists: `VITE_API_ENDPOINT` — unused in prototype; mock all data locally

Do not use Next.js. Do not call Core. Do not invent OWNER ledger screens.

## Visual system (from Elera refs, remapped)

Chrome: pale warm-gray canvas `#F3F1EC` behind a single large rounded app frame (`rounded-[28px]`, white/off-white `#FAF9F6`, soft shadow). Left sidebar ~232px, no border, same fill as frame. Content has generous padding. Cards are white, `rounded-2xl`, 1px `#E8E4DC` hairline, almost no drop shadow.

### Tokens

```css
--canvas: #E8E4DC;
--frame: #F7F6F2;
--card: #FFFFFF;
--sidebar: transparent;
--text: #1A1916;
--text-2: #6B675E;
--text-3: #9A958A;
--line: #E8E4DC;
--accent: #8FDB6E;          /* active nav, primary fill */
--accent-hover: #7CC85C;
--accent-ink: #16350C;
--icon-well: #2A2926;       /* dark rounded square icon wells on KPI/cards */
--chip-green-bg: #E7F6DC;
--chip-green-fg: #2F6B1F;
--chip-blue-bg: #E4F0FF;
--chip-blue-fg: #2157A4;
--chip-amber-bg: #F8E9C8;
--chip-amber-fg: #8A5A12;
--chip-red-bg: #F8D9D4;
--chip-red-fg: #9B2C1F;
--chip-gray-bg: #EEEBE4;
--chip-gray-fg: #5C5850;
--insight-blue-bg: #EAF1FB;
--insight-blue-fg: #1E4E9C;
--insight-green-bg: #E7F4DC;
--insight-green-fg: #215C14;
--warn-bg: #F8E9C8;
--danger-bg: #FBE4DF;
--kanban-done-col: #E7F4DC;
```

Typography: **Plus Jakarta Sans** (or Geist if Jakarta fails). Do not use Inter. Tight tracking on titles. Page title ~22–24px semibold. Section titles 14–15px semibold. Meta 12px `#6B675E`. Numbers in KPI are 22–28px semibold, not display-hero.

### Chrome

Sidebar groups (MVP only — do not add Elera leftovers):

- **Support:** Dashboard, Customers, AI Support, Tasks
- **Account:** Settings

Active item: full-width pill, fill `--accent`, ink `--accent-ink`, icon + label, optional count badge on the pill (dark/10). Inactive: `#1A1916` at 80%. Section labels 11px uppercase-ish muted (`Support`, `Account`) — actually sentence case muted like the refs (`Operations`). Footer of sidebar: nothing extra (no Pro/Help).

Top bar: page title left; right cluster = search (`⌘K`), apps-grid icon button, bell, **+ New** dark pill, circular avatar. Collapse-sidebar glyph between brand and title.

Brand: simple 2×2-dot mark + **SmartLedger** wordmark. Never “Elera”.

### Shared components (build once)

`AppShell`, `Sidebar`, `Topbar`, `KpiStrip`, `Card`, `StatusChip`, `InsightBanner`, `DataTable`, `FilterChips`, `AvatarStack`, `EmptyState`, `Drawer`.

Buttons: primary dark (`#1A1916` white text) OR accent green for the one positive action on a page. Secondary: white + hairline. Chips: rounded-full, 11–12px.

## Screen map (refs → SmartLedger)

Refs live in `/Users/miphu/Downloads/ref_images/`. Copy structure, density, and craft. **Do not copy clinic nouns.**

| Route | Page | Primary ref | What to steal |
|---|---|---|---|
| `/` | Dashboard | `03_54_23` Dashboard | KPI strip, live table card, bar chart, calendar card (dark), bubble/mix card, task list with actions |
| `/customers` | Customers | `03_54_30` Patients | Filter chips, dense table, right **drawer** for shop detail |
| `/ai` | AI Support | `03_54_19` AI Chat | Greeting, 2×2 prompt tiles, floating composer, yellow glow under composer |
| `/tasks` | Tasks | `03_54_26` Patient Flow | KPI strip, filter chips, 4-column board |
| `/settings` | Settings | no 1:1 ref | Card stack using same chrome; preference fields only |

Secondary craft refs: `03_53_48` (KPI + segmented aging + insight banner), `03_54_16` (table + right rail), `03_54_33` (score/report cards), `03_54_36` (alert banner + list).

## Domain content (locked mock)

Vietnamese shop names. English UI chrome is OK (refs are English); mix Vietnamese for shop/owner identity.

### Dashboard KPIs (`AdminOverviewView` — inferred, support-only)

1. Shops active — `128` `+6`
2. Open support tasks — `14` `4 waiting`
3. Owners contacted this week — `23/40`
4. AI drafts pending confirm — `5` `review`

Cards:

- **Shops needing attention** — table: shop, owner, reason, status chip, last seen
- **Support load by hour** — bar chart, one accent-green bar for now
- **This month** — dark calendar card (April-style), green today
- **Task mix** — bubble/circles: Inbox 48%, Investigating 15%, Waiting 8%, Resolved rest
- **Do these first** — 5 action rows with View / Confirm buttons

Insight banner at bottom of a card: blue info, one operational sentence.

### Customers

Filter chips: Needs action `9`, Active `86`, Inactive `12`, All `128`.

Table columns: Shop (avatar initial + name + owner phone), Status, What is needed next, Last access, Owner.

Row click opens right drawer (`AdminShopDetailView`):

- Shop name, owner, phone/email
- “What is needed next”
- Alert if support-blocked (red)
- Fields: shop id, industry, created, last access — **no invoices, stock, debt, tokens**
- Blocking items list
- Footer: no impersonation. Optional “Create task” green button (navigates `/tasks`)

### AI Support

Empty state: “Morning, {Admin name}”. Four tiles: Summarize this shop, Draft a support task, Explain last 7-day access, What is blocking shop X. Composer “Ask SmartLedger” with + and blue send.

Also implement a **filled conversation** toggle (query `?demo=chat`) showing assistant answer + citations chips + `taskDraft` card with Confirm / Discard (Confirm does not POST; toast “prototype — no write”).

Copy must say answers are drafts. `insufficientData` state: muted banner, no fake citations.

### Tasks Kanban

Columns exactly: **Inbox · Investigating · Waiting · Resolved**. Resolved column uses `--kanban-done-col` wash.

Cards: title, shop name, priority chip, due chip, assignee avatar. Yellow note on blocked cards. `+ Add task` at column foot.

KPI: Open `14`, Waiting on owner `4` On target, Overdue `2` breach, Resolved this week `9`.

Filter chips: Overdue, Waiting, Unassigned, High priority.

### Settings

Cards: Appearance (`theme` light/system — dark optional but default light), Density (comfortable/compact), Locale (`vi`/`en`). Role/permissions **read-only** from session (`ADMIN`). No role editor. No OWNER impersonation.

## Anti-slop

No purple gradients, no Inter, no three-equal-card hero, no generic “Welcome to your dashboard”, no clinic/pharmacy copy, no fake 3D, no rainbow accents. One green accent. Dense, specific, operational.

## Out of prototype

Login page, OWNER POS, invoice/expense/debt editors, staff admin, billing, reports module, Message, Pharmacy, Scheduling, Pro/Help.

## Agent split

1. **Foundation + P0:** scaffold, tokens, shell, `/` Dashboard, `/customers` + drawer. Dev server + screenshots.
2. **P1:** `/ai`, `/tasks`, `/settings` on the same shell. Do not restyle tokens.

## Done when

A reviewer can open `http://localhost:5173`, click all five nav items, and the pages are recognizably the same family as the Elera refs (chrome, density, chips, cards) while the nouns are SmartLedger shops/owners/support tasks.
