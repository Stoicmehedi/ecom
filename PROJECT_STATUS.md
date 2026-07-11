# Project Status

> **Single source of truth for this project.** Committed to the repo so anyone — any machine, any
> account — can understand the full state without relying on private notes. **Update this file after
> every task.**

**Last updated:** 2026-07-11
**Repo:** https://github.com/Stoicmehedi/ecom (private)
**App name:** MPoS

---

## 1. What we're building

An **original single-store retail POS + inventory management system**. One store, one company —
no multi-tenant SaaS, no subscription billing, no multi-branch (the schema keeps a `branch_id`
column so we can grow into multi-branch later).

Full product spec (data model, modules, roadmap): see [`BLUEPRINT.md`](./BLUEPRINT.md).

**Ground rules for this project:**
1. **Original UI** — our own visual identity; do not imitate any existing commercial POS product.
2. **Clean repo** — no third-party brand names, screenshots, or scraped data in anything committed.
   (Any local research/reference material stays local and git-ignored.)
3. **Don't delete local files** without explicit instruction.

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Database | PostgreSQL 16 |
| ORM | Prisma |
| API | tRPC / server actions |
| UI | Tailwind CSS + shadcn/ui (original theme) |
| Auth / RBAC | Auth.js + roles/permissions table |

---

## 3. Environment & setup (reproduce on any machine)

**Platform:** WSL2 (Ubuntu 24.04) on Windows.

**Toolchain:**
- Node.js `v20.20.2`, npm `10.8.2` (upgraded from 18 via the NodeSource apt repo — Next.js 16 requires Node ≥20.9).
- PostgreSQL 16 (installed via apt, runs as a service).

**Database (local dev):**
- Connection string: `postgresql://ecom:ecom@localhost:5432/ecom`
- DB `ecom`, role `ecom` / password `ecom` (local dev only).
- Start Postgres if it's down (WSL has no auto-start unless systemd is on):
  ```bash
  sudo service postgresql start
  ```
- Recreate DB from scratch if needed:
  ```bash
  sudo -u postgres psql -c "CREATE ROLE ecom LOGIN PASSWORD 'ecom' CREATEDB;" \
                        -c "CREATE DATABASE ecom OWNER ecom;"
  ```

**System changes made (for transparency / cleanup):**
- Scoped passwordless sudo: `/etc/sudoers.d/010-claude-mehedi`
  (NOPASSWD for `apt-get, apt, service, systemctl, tee` only).
- psql-as-postgres: `/etc/sudoers.d/020-claude-psql`
  (lets the dev user run `psql` as the `postgres` DB user without a password — DB admin, not root).
- Remove either with `sudo rm /etc/sudoers.d/<file>` to revoke.

**Browser automation:** Playwright MCP is configured for UI testing/research
(see private notes; uses a bundled headless Chromium in WSL).

---

## 4. Progress log

### 2026-07-09
- Researched the retail-POS product category; produced `BLUEPRINT.md` (data model, module map, phased roadmap).
- Decided scope: single-store, no SaaS.
- Chose stack: Next.js + PostgreSQL + Prisma + tRPC + Tailwind/shadcn + Auth.js.
- Installed & started PostgreSQL 16; created `ecom` database + role; verified TCP connection.
- Initialized git; created private GitHub repo `Stoicmehedi/ecom`; pushed `.gitignore` + `BLUEPRINT.md`.
- Set up `.gitignore` (Node/Next.js + local-only reference material).
- Established project ground rules (original UI, clean repo, no deleting local files).
- Created this `PROJECT_STATUS.md`.
- Named the app **MPoS**.
- Upgraded Node 18 → 20 (NodeSource apt repo); Next.js 16 requires Node ≥20.9.
- Scaffolded the app: **Next.js 16.2 (App Router) + React 19 + TypeScript + Tailwind v4 + ESLint**, `src/` dir, `@/*` alias.
- Added **Prisma 7.8** with the **`@prisma/adapter-pg`** driver adapter (Prisma 7 needs an adapter at runtime; `url` no longer lives in the schema — it's in `prisma.config.ts`).
- Wrote the **Phase-1 schema** (16 tables: Branch, Role, User, Category, Brand, Unit, Product, ProductVariant, Contact, Purchase, PurchaseItem, Sale, SaleItem, Account, Payment, StockMovement) and ran the `init` migration.
- Added a Prisma client singleton (`src/lib/prisma.ts`) and verified a live DB query.
- Built an original **MPoS landing page** (emerald identity, live DB status + counts); verified it renders in the browser. Production build passes.
- Ran an **ultracode multi-agent workflow** (parallel design → single implementer → verify) to build steps 1–3. Stopped mid-verify to save time, but the implement phase had essentially finished. Landed:
  - **Auth.js v5** credentials login (JWT sessions, **no DB adapter** — user verified via Prisma in `authorize()`), `AUTH_SECRET` in `.env`, `next-auth.d.ts` session typing.
  - **Login page** (`src/app/login/page.tsx`) + `/api/auth/[...nextauth]` route.
  - **App shell** under `src/app/(app)/` — sidebar + topbar + `dashboard` page; route protection via `await auth()` in `(app)/layout.tsx` (redirects to `/login`). `/` redirects to `/dashboard`.
  - **shadcn/ui** (11 components) on Tailwind v4 + the **MPoS emerald theme** in `globals.css`; Sonner toaster.
  - **Seeded** base data: Main Store branch, Admin + Cashier roles, **admin user (`admin` / `admin123`)**, Cash account.
  - Verified: `npm run build` passes; `/login` → 200; `/dashboard` (unauth) → 307 redirect. (Full browser login not yet exercised.)
- **Browser-verified login** end-to-end (`admin`/`admin123` → dashboard shell). ✅
- Built the **Products / Catalog module** (first feature module):
  - **Masters**: Categories (3-level tree), Brands, Units — full CRUD via dialogs + server actions + zod validation; catalog sub-nav tabs.
  - **Products + Variants**: list page; create/edit form (`/products/new`, `/products/[id]/edit`) supporting Simple & Variable products, dynamic variant rows (SKU/barcode/prices), auto-SKU, opening stock → `StockMovement`; safe delete (blocks if sales/purchase history).
  - Added shadcn `select`, `badge`, `textarea`; installed `zod`.
  - **Browser-verified**: created a brand (Zephyr) and a product (Classic Tee, stock 20) — both appear correctly. Build passes.
- **Category UX improvements** (per user feedback):
  - Product form: single category dropdown → **cascading Category → Sub-category → Child** with inline **"+"** quick-add at each level (saves the deepest picked as the product's category).
  - Categories page list: nested/indented rows → **one row per branch** showing the full `Category | Sub-category | Child` path (leaf-only), Edit renames any level in the branch.
  - Categories "Add" dialog: single Parent picker → **three fields (Category / Sub-category / Child)** that create the whole branch at once (find-or-create, reuses existing names, with autocomplete).
  - Browser-verified all three. Build passes.
  - Known pending: on the product form's inline "+" add, the just-added category shows blank in the dropdown until reselected (cosmetic Radix quirk) — not yet fixed.
- **Category autocomplete fixed** (per user report: suggestions weren't showing):
  - The Add-category dialog's three fields used a native `<datalist>`, which never reliably surfaced existing names. Replaced with our own dropdown component (`src/app/(app)/categories/combo-input.tsx`): opens on focus/click, filters as you type, arrow-key + Enter selection, Escape closes the dropdown without closing the dialog.
  - Fixed a scoping bug: sub-category and child suggestions previously listed *every* name at that level regardless of parent. They are now grouped **"Already here"** (names under the parent you typed) and **"Reuse a name"** (all other names at that level) — so a name like "Shirts" can be reused under a brand-new category, which `createCategoryPath` correctly stores as a new row under the new parent.
  - A "New — '<name>' will be created" hint appears when the typed name doesn't yet exist under that parent.
  - `categories/page.tsx` now passes the full category tree (id/name/level/parentId) to the dialog instead of three flat string lists. Typecheck + build pass; browser-verified.
- **Process rules written into [`AGENTS.md`](./AGENTS.md)** (auto-loaded via `CLAUDE.md` every session), after this file was skipped at the start of a session:
  - **Session protocol** — read `PROJECT_STATUS.md` before any work; update it after every task.
  - **Module protocol** — before building a module, study the reference app's equivalent module with Playwright (fields, mandatory vs optional, validation, workflow, downstream effects), write it up as a requirements list in `BLUEPRINT.md`, settle any §6 open decision it touches, *then* build. Copy the process, never the interface.
  - Restated the hard rules (original UI, clean repo, never delete local files).

### 2026-07-11
- **Studied the reference app's purchase module** (read-only, Playwright) and wrote it up as
  [`BLUEPRINT.md`](./BLUEPRINT.md) **§7 — Purchases & Stock**. Key findings: they track **both** an
  average purchase price (weighted-average cost) *and* a last purchase price per variant; a purchase
  return is capped at `purchased − already-used` qty; supplier invoice numbers are **not unique**.
- **Settled §6 open decisions** for this module: own `PUR-00001` sequence + separate non-unique
  supplier invoice no.; edit/delete blocked once stock is sold; split payments supported.
- **Schema** (migration `purchases_stock`): `ProductVariant.lastPurchasePrice`;
  `Purchase.purchaseNo` (unique) + `supplierInvoiceNo` + `discountType`/`discountValue`;
  `PurchaseItem.returnedQty`; new `ReturnType`, `PurchaseReturn`, `PurchaseReturnItem`;
  `Contact.businessName`/`note`/`isActive`; `Payment.purchaseReturnId`. Seeded Bank account +
  4 return reasons.
- **Built the Purchases & Stock module:**
  - `src/lib/costing.ts` — weighted-average cost in/out, discount resolution, doc status.
  - **Suppliers**: list + CRUD dialog, quick-add from the purchase form, per-supplier **ledger page**
    (running balance) with a **Pay due** action.
  - **Purchases**: list, detail, new/edit form (live product search by name/SKU/barcode, editable
    qty & price, order discount amount-or-percent, **split payments**), safe delete.
  - **Purchase returns**: per-purchase return form (return qty capped at `purchased − returned` and
    at stock on hand), returns list with delete/restore.
  - **Inventory**: per-variant stock with avg cost, last cost, in/out, and stock value at cost and at
    selling price; low-stock filter.
- **Browser-verified the whole chain end-to-end** (numbers checked against the DB):
  buy 10 @ 8.00 on top of 20 @ 5.00 → stock **30**, weighted-average cost **6.00**
  (`(20×5 + 10×8)/30`), last cost 8.00, supplier due 30.00, cash −50.
  Return 2 → stock **28**, avg cost **5.86** (`(30×6 − 2×8)/28`), due 14.00. Pay due → 0.00.
  Return qty over the cap is clamped; deleting a purchase that has a return is refused.
  Typecheck + production build pass.

- **Built the Customers module** (ahead of POS, which needs a customer picker). Studied the
  reference app's customer module read-only first → `BLUEPRINT.md` **§8**. It's the mirror of
  Suppliers, with the money flowing the other way (a customer balance is a **receivable**).
  - Settled §6 decisions: **customer groups ship now** (name + default discount %, POS pre-fills it);
    **phone is the only required field**, name optional (blank names fall back to `Customer <phone>`).
  - Schema (migration `customers`): new `CustomerGroup` (name + discount %);
    `Contact.customerGroupId` + `Contact.isWalkIn`. Seeded a **Walk-in customer** for POS.
  - **Customers**: list, CRUD dialog, quick-add (for POS), per-customer **ledger page** with running
    balance and a **Receive due** action (capped at the outstanding due).
  - **Customer groups**: small master page with CRUD.
  - **Browser-verified**: opening due 500 → received 200 → due **300**, ledger reconciles, and cash
    went **up** (the opposite direction from a supplier payment). Phone-only customer got the
    `Customer 01999000111` placeholder. Walk-in delete is blocked.
  - **Bug found and fixed during verification:** deleting a customer group silently *un-grouped* its
    customers instead of being refused — the optional FK is `ON DELETE SET NULL`, so the `isFkError`
    guard never fired. Now an explicit count check refuses the delete. Re-verified.

- **Built the POS checkout module.** Studied the reference app's POS screen read-only first →
  `BLUEPRINT.md` **§9**.
  - Settled §6 decisions: **overselling is blocked** (stock can never go negative);
    **VAT deferred** (column stays 0); scope = cash-tendered → change, Hold/park, 80mm receipt;
    **no delivery charge**; exchange stays Phase 2.
  - Schema (migration `pos`): `Sale.dueDate` + `discountType`/`discountValue`; new **`HeldSale`**
    (parked cart as JSON).
  - **POS terminal**: product tiles + search by name/SKU, an **exact barcode/SKU match drops
    straight into the cart** (a scan needs no click), cart with qty steppers, walk-in default,
    **group discount auto-fills** from the customer, split payments, **cash tendered → change due**,
    Hold/resume/discard.
  - **Sales**: list with totals, detail page showing **cost of goods and profit** (from `costAtSale`),
    delete that fully reverses stock + payments + receivable. A sale is never edited (§9.8).
  - **80mm thermal receipt**, print-styled so the app shell drops away when printed.
  - **Browser-verified**: sold 3 × 12.00 to a Gold customer → 10% auto-discount, total **32.40**;
    paid 20 → **stock 20 → 17**, **`costAtSale` snapshotted at 5.00** (the weighted-average cost),
    customer receivable 300 → **312.40**, cash +20, `soldById` recorded. Cash tendered 50 → change
    **17.60**. Overselling clamped (99 → 20). Hold parked the cart touching **no** stock/ledger, and
    resumed correctly.
  - **Bug found and fixed during verification:** the credit-sale guard was `due > 0 && !customerId`,
    but the walk-in customer *has* an id — so the server would have parked a receivable on
    "Walk-in", i.e. money owed by nobody. It now rejects a due when the customer `isWalkIn`.
- **Built the Sale Returns module** — the last Phase-1 gap. Studied the reference app's sale-return
  screen read-only first → `BLUEPRINT.md` **§10**. (Notable: a sale return has **no reason/type**
  field, unlike a purchase return.)
  - Schema (migration `sale_returns`): `SaleItem.returnedQty`; new `SaleReturn` / `SaleReturnItem`
    (the item keeps the `cost` the goods left at); `Payment.saleReturnId`.
  - Return form off any sale: return qty capped at `sold − already returned`; refund in cash, or
    leave at zero to credit it against what the customer owes.
  - **Restocks at `costAtSale`, not today's average** — putting goods back at the current average
    would silently rewrite what the remaining stock is worth.
  - **A walk-in must be refunded in full** — crediting a walk-in's "account" would leave a balance
    owed to nobody (the same trap as the POS credit-sale bug). Enforced on the server, not just the UI.
  - Deleting a return sends the goods back out; refused if that stock has already been re-sold.
  - **Browser-verified**: returned 1 of 3 on a credit sale → stock 17 → **18**, item `cost` kept at
    **5.00**, `returnedQty` 1, customer due 312.40 → **300.40**, cash untouched. Walk-in sale then
    returned → refund forced to the full 12.00, **walk-in due stayed 0.00**, and cash netted back to
    exactly where it started. Over-cap return clamped (99 → 3).
- **Dev-data note (resolved):** the `PUR-00001` purchase and its return disappeared mid-session —
  **the user deleted them**, not a bug. Reassuringly, the reversal arithmetic round-tripped
  **exactly** back to the original 20 @ cost 5.00, which is good evidence the reverse logic is right.

- **Built the Reports module — Phase 1 is now complete.** Studied the reference app's report screens
  read-only first → `BLUEPRINT.md` **§11**. They ship **43 report screens**; almost all are either
  re-cuts of the same question or belong to Phase-2 modules we don't have. Everything Phase 1 owes
  the shopkeeper collapses into **five**: Overview, Sales, Profit & Loss, Product profit, Dues.
  - Settled §6 decisions: **profit is Admin-only** (`reports.profit`; they use a second admin
    password, we use the role system we already have); **sale returns reduce gross profit**, not just
    net sales; export = **print + CSV + real `.xlsx`** (added `exceljs`).
  - **One report = one definition** (`src/lib/reports/`): each report is a `ReportTable`
    (columns + rows + totals) that the screen *and* the CSV/Excel exports render from, so an export
    can never disagree with what is on screen. Filters live in the URL, so a report is linkable and
    the export endpoint reuses the exact query string.
  - **Sales**: one screen replaces their Daily/Monthly/Yearly/Master/Detail reports — those differ
    only in *grouping*, so grouping is a control (`invoice | day | month`), not five screens.
  - **Profit & Loss**: Revenue block → Cost-of-goods block → gross profit + margin, with a clearly
    separated **cash-movement** block so nobody mistakes cash for profit.
  - **Dues**: receivable and payable on one screen, with an **Age (days)** column — ours, not theirs;
    a due is only a problem once it is old.
  - **Print** strips the app shell (same trick as the 80mm receipt); A4 landscape, repeating headers.

  **Two real bugs found and fixed while verifying:**
  1. **Product profit didn't reconcile with the P&L.** The order-level discount lives on the *sale*,
     not the line, so summing line profits overstated total profit by exactly the discount given
     (21.00 vs the true 17.40). The discount is now **apportioned across the lines** by their share
     of the bill, and the two reports agree to the cent. *That reconciliation is the test that either
     report is right* — `scripts/check-reports.ts` asserts it.
  2. **Inventory leaked cost to cashiers** — avg cost, last cost and stock-value-at-cost were visible
     to everyone, contradicting the Admin-only decision we had just taken. Now gated.

- **Fixed the sale-return discount bug + a multi-agent code review of the reports module.**
  - **The money bug (`BLUEPRINT.md` §10.1a):** a return credited the **list price**, ignoring the
    bill's discount — so returning one shirt from a 10%-off sale handed back 12.00 for goods the
    customer paid 10.80 for. It scaled with the discount and was trivially exploitable (buy
    discounted, return, keep the difference). Returns are now priced at
    `list × (subtotal − discount) / subtotal` via a shared `paidRatio()` helper in `costing.ts` —
    the same apportioning the product-profit report already did. The return form shows the adjusted
    price and says why. Existing dev rows were re-priced and the customer's balance re-settled.
    **Proven end-to-end in the browser:** sold 2 @ 12.00 to a Gold customer (10% off → 21.60) on
    credit, then returned *both* → his balance went 301.60 → 323.20 → **exactly 301.60**, cash never
    moved, stock 17 → 15 → **17 @ 5.00**. Net sales and gross profit were **unchanged** by the
    round-trip, which is the correct behaviour: a fully-returned sale earns nothing.
  - **A high-effort multi-agent review found 9 more defects, all now fixed:** the P&L subtracted
    returns at gross price from discount-net revenue (same root cause); **no report *screen* checked
    `reports.view`** — only the export API did, so a role without it could read every report by URL;
    product profit silently dropped returns of goods sold in an earlier period (breaking the
    reconciliation it advertises); the day/month "Net sales" column never subtracted returns, so it
    disagreed with the P&L; an unvalidated `status` in the URL reached Prisma and **500'd** the page
    and the export; the dues rows linked to `/ledger` routes that don't exist; the P&L export put the
    margin **percentage into a money column**; an unbounded `?from=1900-01-01` built ~46,000 chart
    bars and took the page down (range now capped at 366 days); quantity totals were rounded to 2dp
    under 3dp columns; and the range picker kept stale dates after a preset click.
  - `scripts/check-reports.ts` now also asserts every return line is priced at what the customer
    actually paid, and that the grouped "Net sales" means the same thing the P&L means by it.

  **Browser-verified end-to-end** against hand-computed figures: today's 3 sales and 2 returns →
  gross sales 60.00 − discount 3.60 − returns 24.00 = **net sales 32.40**; COGS 25.00 − returned cost
  10.00 = **net COGS 15.00**; **gross profit 17.40**, margin **53.70%**. Product profit totals match
  exactly. Exports checked by reading the files back (CSV quoting + BOM; the `.xlsx` is a real Excel
  file with numeric cells and number formats, not strings). Permission gates checked as a real
  cashier: profit tabs hidden, profit pages refused, and the export API returns **403** (and 401
  signed-out). Typecheck + production build pass.

- **Re-studied the Products module against the reference app — it has a large gap.** Products was the
  **first** module built, *before* the module-build protocol existed, so it never got the
  field-by-field study every later module got. Written up as [`BLUEPRINT.md`](./BLUEPRINT.md) **§12
  (Products, round 2)**. Headlines:
  - **Variants must be generated, not typed.** They have **Attribute Categories, Attributes and
    Colors** as masters plus a **Generate variants** button (size × colour → the whole grid) and an
    **Apply to all** bulk-fill row. We make you hand-add every variant row. For a clothing shop this
    is the difference between usable and not. We have none of those three masters.
  - **Fields we don't have:** alert quantity (per-product low-stock threshold — we hardcode 5),
    **minimum sale price** (a floor the POS must enforce), wholesale quantity, per-variant standing
    discount, product code, short description (`Product` has **no description column at all**), sort
    index, image upload (ours is a pasted URL).
  - **`ProductVariant.wholesalePrice` is dead code** — the column exists and *nothing reads it*.
    Wire it up with a qty threshold, or drop it.
  - **`Product.isActive` has no UI** — so a product that has history (delete is blocked) currently
    **cannot be retired at all**.
  - **The product list is bare:** no search, no filters, no enable/disable, no duplicate, no import,
    no export, no barcode/label printing.
  - §12.7 raises the decisions this forces — including the **EAN-13 barcode** question that §6 has
    been parking under *"decide when building barcode/label printing"* (that time is now), and
    **discount precedence** (variant discount vs. customer-group discount vs. manual bill discount —
    a shop that stacks all three by accident gives the store away).

- ⚠️ **Process incident — a record was created in the reference app's live account.** Its Add-Product
  screen is a two-step wizard; I assumed **"Next"** was client-side navigation to step 2, but it
  **saves**. A product (`ZZ-READONLY-PROBE`) was created and **immediately deleted** — it had no
  stock, barcode, purchase, sale or ledger entry, so nothing else moved. The information was then
  obtained with zero risk by reading an **existing** product's edit page, which is what should have
  happened first.
  **Rule tightened (see [`AGENTS.md`](./AGENTS.md)):** on the reference app, only ever open *existing*
  records and list/report pages. Do not fill a create form and do not click *any* button on one —
  "Next"/"Continue"/"Save & Continue" can all persist.

- **Products, round 2 — BUILT (`BLUEPRINT.md` §12).** Every gap §12 named is now closed. Migration
  `products_v2`.
  - **Attributes, Colours and the variant generator.** New masters — an **axis** (Size, Fit…) holding
    its **values**, and **Colours** as their own axis — on a new `/attributes` screen. A variable
    product picks its sizes and colours as chips and presses **Generate variants**: the grid is the
    cross-product (3 sizes × 2 colours → 6 rows). Regenerating **keeps existing variants** — their
    prices, stock and history survive; a variant that a purchase or sale has touched cannot be
    dropped. **Apply to all** bulk-fills cost/price/discount/wholesale/opening down the grid.
  - **The pricing rule, written once** (`src/lib/pricing.ts`, `BLUEPRINT.md` §12.7a) and called by
    **both** the POS client and the server, so what the cashier sees is what is charged:
    **wholesale price** takes over at its qty threshold → then the **single best** discount applies
    (per-variant vs customer-group — **never stacked**) → a **manual bill discount replaces** the
    automatic one → **minimum sale price** is a hard floor. The POS now sends only *variantId + qty*;
    the server prices the bill. A floor the browser could talk around is not a floor.
  - **Alert quantity** (per-product low-stock threshold, replacing the hardcoded 5), **minimum sale
    price**, **wholesale quantity**, per-variant standing discount, product code, description and
    sort index — all added. `wholesalePrice` is no longer dead code.
  - **Product list:** search, category/brand/status filters, **enable/disable** (a product with
    history can now be retired — it vanishes from POS search), **duplicate** (fresh SKUs and
    barcodes, zero stock) and per-row actions.
  - **Barcodes and labels.** **EAN-13 settled**: we generate real, check-digit-valid EAN-13s in the
    in-store `20` prefix range, automatically, for every variant that has none. `/labels` prints a
    label sheet — barcode drawn as inline SVG from the digits themselves (no dependency, no image
    hosting, crisp at any size), with optional name and price.
  - **Import / export.** CSV export of the whole catalogue (one row per variant, honouring the list's
    filters) and an importer that **previews before it writes** — it names every row it will create,
    update or skip, and every category, brand, unit, size and colour it would have to create. The
    SKU is the key. **Stock is never importable** — it moves only through purchases, sales and
    returns, each of which carries a cost and an audit trail. An export re-imports losslessly (the
    `axis` column travels with `size`, so "M" comes back a Size and not a Fit).

  **Browser-verified end to end:** Size {S,M,L} × {Red, Navy} → 6 generated variants, all with valid
  auto EAN-13s; wholesale switched at qty 5 (12.00 → 10.00); a 20% bill discount on top was **refused
  by the server** *and* blocked in the UI as it was typed (it breached the 9.00 floor); for a Gold
  customer, a 20% variant discount beat the group's 10% (**9.60, not 8.64** — no stacking) and the
  sale wrote `listPrice` 12.00 alongside the charged 9.60; disable removed the product from POS
  search; duplicate produced distinct SKUs/barcodes at zero stock; the label sheet rendered; and a
  CSV round-trip created a new size (XL) and colour (Olive), updated a price without touching stock,
  and skipped the malformed row without creating anything. Typecheck + production build pass; no new
  lint findings.

- **POS grid now shows products, not variants** (`BLUEPRINT.md` §12.10). Generating variants exposed
  the flaw immediately: the grid was a tile per *variant*, so Field Tee alone filled it with six
  near-identical tiles and the catalogue was unreadable. One tile per **product** now — price range,
  total stock, option count — and tapping a variable one opens a **size × colour picker** with the
  price and stock in each cell (falling back to a list when there is only one axis). Out-of-stock
  cells are shown and disabled, not hidden. **A scan still bypasses the picker entirely**: an exact
  barcode or SKU names one variant and drops straight into the cart. Browser-verified: 18 variant
  tiles collapsed to 5 product tiles; tapping M/Red added M/Red; scanning L/Navy's barcode added it
  with no dialog; simple products still add on one tap.

---

## 5. Current state

- ✅ Spec written, stack chosen, DB running, repo live.
- ✅ Next.js app scaffolded (Next 16.2, React 19, Tailwind v4), named MPoS.
- ✅ Prisma 7 wired to Postgres via pg adapter; Phase-1 schema migrated (16 tables).
- ✅ **Auth + login + app shell + dashboard working**; build passes; routes protected.
- ✅ **shadcn/ui + MPoS emerald theme** in place (11 components).
- ✅ **Seed data present**: Main Store branch, Admin/Cashier roles, admin user, Cash account.
- ✅ **Products/Catalog — COMPLETE (round 2 shipped).** Categories, Brands, Units, Products+Variants,
  plus **attribute/colour masters + variant generator**, alert qty, **minimum sale price** (enforced
  at checkout), wholesale price/qty, per-variant discount, product search/filters/disable/duplicate,
  **auto EAN-13 barcodes + label printing**, and **CSV import/export**. The hole `BLUEPRINT.md` §12
  described is closed. Browser-verified; build passes.
- ✅ **Pricing has exactly one rule, in one file** (`src/lib/pricing.ts`, spec in `BLUEPRINT.md`
  §12.7a): wholesale threshold → best *single* discount (variant vs group, never stacked) → manual
  bill discount *replaces* the automatic one → minimum-sale-price floor. The POS client and the
  server both call it, and the server is the authority (the client sends only variantId + qty).
- ✅ **Category autocomplete** works (parent-scoped suggestions + reuse-a-name across branches).
- ✅ **Session + module build protocol** documented in `AGENTS.md` (loaded every session via `CLAUDE.md`).
- ✅ **Purchases & Stock module done** — suppliers (+ ledger & due payment), purchase entry with
  weighted-average costing, purchase returns, inventory view. Browser-verified; build passes.
- ✅ **Customers module done** — customers (+ groups with a default discount %, ledger, receive-due),
  walk-in customer seeded for POS. Browser-verified; build passes.
- ✅ **POS + Sales done** — POS terminal (scan → cart → discount → split payment → change → receipt),
  Hold/park, sales list & detail with profit, 80mm receipt. Browser-verified; build passes.
- ✅ **Sale Returns done** — return off any sale, restocked at `costAtSale`, refund or credit;
  walk-ins refunded in full. Browser-verified.
- ✅ **Reports done** — Overview, Sales (grouped by invoice/day/month), Profit & Loss, Product
  profit, Dues. Print + CSV + Excel export on each. Profit is Admin-only. Browser-verified.
- 🎉 **PHASE 1 IS COMPLETE.** The app runs the whole retail loop end to end: buy stock in → sell it →
  take it back → and know the profit, the margin, and who owes what in both directions.
- ✅ `BLUEPRINT.md` §7 (Purchases), §8 (Customers), §9 (POS), §10 (Sale returns), §11 (Reports) hold
  their requirements (written before building, per protocol).
- ⬜ `middleware.ts` not added (protection currently via the `(app)` layout `auth()` guard — fine; add later for edge-level defense-in-depth).
- ✅ **Sale returns credit what the customer actually paid** (the bill's discount is apportioned
  across the lines) — fixed and proven by round-trip: fully returning a sale lands the customer's
  balance exactly where it started. See `BLUEPRINT.md` §10.1a.
- ✅ **Reports reviewed by a multi-agent code review at high effort**; all 10 confirmed defects fixed
  (money math, the `reports.view` gate on screens, two 500s, and the totals/links/rounding nits).
- ⬜ `/settings` is in the sidebar but has no page yet (404).
- ⬜ **`Sale.due` is not reduced by a return** — a return settles against the *customer's account
  balance*, never the invoice. So a fully-returned credit sale still shows its original due on the
  Sales and Dues reports, while the customer's ledger is correctly square. Both numbers are
  internally consistent (invoice-level vs account-level), but decide deliberately whether an
  invoice's due should close when its goods come back. **Not a bug we hit; a modelling choice to
  settle.**
- ⬜ Deferred to Phase 2 (out of scope for the purchases module): purchase orders, stock
  adjustments, supplier advances/due-dismiss, attachments, areas & contact groups.

**Dev logins:** `admin` / `admin123` (Admin — sees everything) · `cashier` / `cashier123`
(Cashier — no cost, no profit; use it to check the permission gates).

**Dev data now in the DB** (from end-to-end verification): supplier *Rahim Traders*; customers
*Walk-in* (seeded), *Karim Mia* (Gold group, 10% off, **300.40** due) and a phone-only customer;
sales `INV-00001` (credit) and `INV-00002` (walk-in), returns `SRT-00001` (credited) and `SRT-00002`
(cash-refunded) → Classic Tee at **18 in stock, cost 5.00**. The purchase/return test data was
deleted by the user. Products round 2 then added: axis **Size** {S, M, L}, colours **Red/Navy/Olive**,
and the variable products *Field Tee* (6 variants, min sale price 9.00, wholesale 10.00 @ qty 5),
*Field Tee (copy)* and *Trail Hoodie* (imported from CSV). Wipe and re-seed for a clean slate.

## 6. Next steps (resume here)

**Phase 1 is complete and Products round 2 has closed the last known hole.** The product model now
carries everything the modules above it need, so Phase 2 can start on solid ground.

1. **Settle the `Sale.due` question** (see §5) — a small modelling decision, not a bug.
2. **Then Phase 2, in the order that pays** (see `BLUEPRINT.md` §5). Each a module built to protocol
   (study the reference app → write it into `BLUEPRINT.md` → settle §6 → build):
   - **Expenses + accounts** — the biggest hole in the P&L. Gross profit becomes a true *net* profit
     only once expenses and salaries post against it; the P&L screen already has the slot for it.
   - **Stock adjustments** — damage, loss, corrections. Today stock can only move via buy/sell/return.
   - **Exchanges** — deferred from POS; a very common counter request.
   - Then: employees/salary, loyalty points, VAT (if it's actually needed).
3. Housekeeping whenever convenient: `middleware.ts` for edge-level route protection, and a
   `/settings` page (the sidebar links to one that doesn't exist yet). The shop-wide default alert
   quantity is still the constant 5 — it belongs in `/settings` once that page exists.
4. Still open from `BLUEPRINT.md` §12: **product image upload** (ours is a pasted URL — needs a
   storage decision), **per-language product names**, and a **Product Groups** master.

*(Products round 2 — done 2026-07-11. Reports — done 2026-07-11, then reviewed and hardened. Sale
returns, POS, Customers, Purchases — done 2026-07-11. Exchange, VAT, and loyalty-point redemption
were explicitly deferred to Phase 2.)*

> The reference app's URL/credentials are **not** recorded here on purpose (clean-repo rule) — they
> live in the private session notes. If they aren't in context, ask the user for them.

---

## 7. How to run

```bash
# 1. Ensure Postgres is running (WSL has no auto-start unless systemd is on)
sudo service postgresql start

# 2. Install deps
npm install

# 3. Apply migrations + generate the Prisma client
npx prisma migrate dev
npx prisma generate

# 4. Dev server
npm run dev            # http://localhost:3000

# Other:
npm run build          # production build
npx tsx scripts/dbcheck.ts        # quick DB connectivity check
npx tsx scripts/check-reports.ts  # recompute every report figure from the raw rows and
                                  # assert the reports agree — including that product profit
                                  # reconciles exactly with the P&L's gross profit
```

**Key files:**
- `prisma/schema.prisma` — data model · `prisma.config.ts` — Prisma config (DB url via dotenv)
- `src/lib/prisma.ts` — Prisma client singleton (pg adapter)
- `src/app/` — Next.js App Router · `.env` — `DATABASE_URL` (git-ignored)
