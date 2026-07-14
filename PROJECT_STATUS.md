# Project Status

> **Single source of truth for this project.** Committed to the repo so anyone — any machine, any
> account — can understand the full state without relying on private notes. **Update this file after
> every task.**

**Last updated:** 2026-07-13
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

- **Studied the reference app's POS read-only, then let its own data choose what to build.**
  Written up as `BLUEPRINT.md` **§13** (the delta) and **§14** (exchange). The method mattered more
  than the list: I first ranked *line price/discount override with a manager password* as the top gap
  because the reference app has it. Checking the shop's actual sales killed that: the setting is
  **switched off** in their own account (`PRODUCT_WISE_DISCOUNT=0`, `ASK_PASSWORD=0`) and **not one
  invoice carries a discount** — every line is a clean tag price. It was dropped. **Build what the
  shop does, not what the software offers.**

  The same check found two things I had wrongly deferred:
  - **Exchange is real** — 21+ approved exchanges, Nov 2024 → Sep 2025. For a children's clothing shop
    it is *the* counter request. **Built (below).**
  - **Loyalty points are live right now** — invoices show earned/available points and a customer holds
    a balance of 410. Cutting over to MPoS today would lose them. **Now the top of §6.**

- **Exchange — BUILT (`BLUEPRINT.md` §14).** Migration `exchange`. The POS gets an **Exchange** panel:
  find the invoice the goods went out on, take back what is coming back, and the rest of the cart is
  what replaces it. An exchange is **not a new kind of document** — it is a sale return and a sale
  settled in one transaction, which is exactly how the reference app models it (*From Invoice → To
  Invoice*). New `/exchanges` register shows that pairing.
  - **The credit is never typed.** It is what the sale's ledger says the customer *paid* for those
    goods — the bill's discount apportioned (§10.1a). Theirs lets the cashier retype it; a credit you
    can type is a hole in the till.
  - **An invoice is required.** Theirs can credit a bare barcode with no invoice behind it. We will not
    credit goods we cannot trace to a sale.
  - The returned goods land on the shelf **before** the new sale takes anything off it — so a customer
    can swap the last shirt on the rail for another size of the same thing.
  - The credit is spent as a payment **in goods**: a payment line of `method = "EXCHANGE"` with **no
    account**, because no cash crossed the counter. Only an excess (goods worth more than the
    replacement) actually moves money.
  - `src/lib/sale-return.ts` now holds the one copy of the return maths, called by **both** the returns
    screen and the exchange — so the two cannot drift apart.

  **Browser-verified against hand-computed figures.** *Even swap:* returned Karim's S/Red (paid 10.80)
  for an M/Red (10.80 at his group rate) → new sale fully paid by a 10.80 EXCHANGE credit, **cash
  unchanged at 249.60, his balance unchanged at 301.60** — no invented money. *Excess:* sold 2 ×
  Classic Tee to a walk-in for 24.00, then exchanged both for one → credit 24.00, 12.00 applied to the
  new sale, **12.00 refunded in cash** (Cash 273.60 → 261.60), stock 16, walk-in balance still 0.

- ⚠️ **Fixed a latent repo-breaking bug found while migrating:** the `products_v2` migration was
  timestamped **before** the migrations that create the `DiscountType` enum, so it only worked because
  it happened to be applied last. **A fresh clone could not build the database at all.** Renamed to
  sort correctly and proved it by replaying every migration into an empty database from scratch.

### 2026-07-13

- **Free issue & sale remark — BUILT (`BLUEPRINT.md` §16). The defect §6 flagged is closed.**
  Adding the minimum sale price (§12.7) had made it **impossible to sell a line at 0.00** — but the
  shop does exactly that (an invoice in their live account reads remark **"Qc Out"** on a zero-value
  sale: a QC write-off). MPoS would have refused that sale outright, so the stock could never have
  left the books. Migration `free_issue` (`SaleItem.isFree`).
  - **A free line is declared, not priced.** The naive fix — letting the price go to zero — would have
    handed every cashier a way around the floor. It is a **toggle**, so there is no path from a
    discount box to zero: the floor still binds every priced line, without exception.
  - **Admin-only**, on a new **`sales.free_issue`** permission (settled with the user). The cashier's
    POS does not render the control **and the server refuses a free line regardless of what the
    browser sends**.
  - **A free line must say why.** `Sale.note` already existed on the model and had never been
    surfaced — it becomes the **remark**, mandatory whenever any line is free, enforced server-side.
    It prints on the receipt.
  - Everything downstream fell out with no special case: the goods leave stock; the line keeps its
    real `costAtSale`, so the P&L books the write-off as **a loss of exactly what the goods cost**;
    and a **return of a free line credits 0.00** on its own, because returns are already priced at
    what the customer actually paid (§10.1a).

  **Browser-verified against hand-computed figures, as admin and as cashier.** Gave away a Field Tee
  M/Red — **a product with a 9.00 floor, i.e. the exact line that could not be sold before** — beside
  a paid L/Red: total 24.00 → **12.00**, "Given away 12.00", stock moved on **both** (9→8, 10→9), cash
  +12.00, and **gross profit 0.00** (the 6.00 earned on the sold shirt exactly cancelled by the 6.00
  written off). Then an **all-free sale**: total **0.00**, status PAID, **no payment rows**, remark
  "Qc Out", stock 10→9, profit **−6.00**. `check-reports.ts` still reconciles with the free line in
  the data. Typecheck + build pass; **no new lint findings** (the 9 existing ones pre-date this).

  **The gates were proven by forging the wire, not by trusting the UI** — the checkout payload was
  rewritten in flight with Playwright: a **cashier** sending `free:true` is refused *("You do not have
  permission to give goods away free")*, and an **admin** sending a free line with the remark stripped
  is refused too. Neither created a sale.
- ⚠️ **Bug found and fixed in passing (pre-existing):** the Hold/park schema declared only six of the
  cart line's fields, and zod strips what it doesn't declare — so a **resumed held cart came back
  having silently lost `discountType`, `discountValue`, `wholesalePrice`, `wholesaleQty` and
  `minSalePrice`**. The cashier saw list prices with no discount and no floor warning. No money was
  ever wrong (the server re-reads the variant and prices it itself — which is exactly why that design
  holds), but the screen lied. The schema now carries the whole line.
- **Dev-data note:** a botched first attempt at the wire-forgery test created a real paid sale
  (`INV-00011`, 12.00). It was deleted through the app's own reversal path — cash and stock went back
  to where they were. Said here rather than quietly cleaned up.

- **Loyalty points + Settings — BUILT** (`BLUEPRINT.md` §15 and §17). Migrations `loyalty_and_settings`
  and `return_money_credit`.

  ⚠️ **Studying the reference app first stopped us shipping a 10× giveaway.** We had *agreed* an earn
  rate of 1 point per 10 taka with each point worth 1 taka — a **10% return**. Their live Point System
  page says otherwise: **minimum amount 100 → 10 points, repetitive**, and **1 point = 0.10**. So the
  earn rule is a **repeating threshold, not a rate**: `floor(bill ÷ 100) × 10`. Checked against three
  real invoices — 640 → **60** pts, 740 → **70**, 660 → **60** — it matches all three, and a linear
  rate matches **none** (it would give 64, 74, 66). The real scheme returns **1%**. Ours would have
  returned 10%, on every sale, forever. *Second time the shop's own data has killed a plausible answer.*

  - **Settings ships too, because loyalty forced it** (§17): `/settings` had been a **404 in the
    sidebar since day one**. Now a real page — **one typed row**, not a key/value bag of strings.
    Holds the loyalty rule, and the **default alert quantity** (the hardcoded `5` in the low-stock
    filter moved here). **Admin-only** (`settings.manage`). It shows a **live worked example** —
    change the rule and it tells you *"a bill of 640 earns 60 points"* and *"an effective return of
    1.00%"* — so the cost of the scheme is on screen before it is saved, not discovered later.
  - **Configurable, per the user's instruction:** earn amount, earn points, repeating, point value,
    minimum balance to redeem (**100**), and the max share of a bill points may cover (**50%**).
    Defaults are the shop's real rule, so day one behaves exactly as their customers expect.
  - **A redemption is a payment made in points, not a discount** — a `Payment` row with
    `method = "POINTS"` and **no account**, exactly like the exchange credit (§14). Nothing crossed the
    counter, so no account gains a penny. Line pricing, discounts and the **minimum sale price floor
    are untouched**: the goods sold for what they sold for.
  - **A points ledger** (`PointEntry`), one row per movement, each pointing at the sale or return that
    caused it. `Contact.loyaltyPoints` is only a cache of it. Shown as **Points history** on the
    customer page — a balance nobody can explain is a balance nobody can trust.
  - **Points reverse with the goods** (settled with the user): earned points are clawed back in
    proportion to what was credited — the same `paidRatio` rule as §10.1a.

  🔑 **The subtle one, caught while building: points must not be able to launder into cash.** If a
  customer pays part of a bill in points and then returns the goods, refunding that part in *money*
  turns points into cash — buy with points, return for a refund, repeat. So **points spent come back
  as points**, and the money credit shrinks by exactly what they were worth. `SaleReturn.moneyCredit`
  stores that figure rather than recomputing it, so undoing a return stays exact even if the point
  value is edited afterwards. The customer is made whole **in the same instruments they paid with**.

  **Browser-verified end to end, every figure checked against the DB.** Sold 40 × 20.00 to Karim
  (Gold, 10%) → 720.00 → **70 points** (`floor(720/100)×10`); again → balance **140**. Then a 180.00
  bill redeeming all 140: charged **166.00**, with a `POINTS` payment of 14.00 carrying **no account**
  — cash rose by exactly the 166.00 charged, so no money was invented. The ledger summed to the cached
  balance at every step. **Then the round-trip that proves the laundering guard:** returning that sale
  in full gave back **140 points** (his balance returned to exactly 140) and credited his account
  **166.00, not 180.00** — cash never moved. *The points came back as points.*

  **Both gates proven by forging the wire, not by trusting the UI.** A redemption breaching the 50%
  cap is refused server-side (*"At most 90 points (9.00) can go on this bill"*), no sale created. And
  a **cashier replaying the genuine settings server-action** — captured from a real admin save, with a
  hostile payload making each point worth **100.00** — is refused: *"You do not have permission to
  change settings."* The stored point value was still 0.10 afterwards.

  Typecheck + build pass; `check-reports.ts` still reconciles; no new lint findings.
- ⚠️ **Bug found and fixed during verification:** the return form's summary said *"Credited against
  due 180.00"* when the server correctly credited **166.00** (it was showing the goods' value, not the
  money value). Server was right, screen was wrong — fixed.

- **Dev DB wiped and re-seeded** — the leftovers §6 warned about are gone. `prisma/seed.ts` now lays
  down **base data + a small demo catalogue**, and is idempotent (it re-runs safely and declines to
  re-lay a catalogue that already exists).
  - **Base:** Main Store, Admin/Cashier roles, **both users now seeded** (`cashier` had only ever
    existed by hand — a wipe would have taken it, and the permission gates can only be proven by
    logging in as one), Cash (**50,000 float**) + Bank, return reasons, walk-in customer, and the
    settings row.
  - **Catalogue:** 5 products / **20 variants** — Classic Tee (S/M/L × Red/Navy), Field Tee (with the
    **9.00 floor** and a **wholesale break at qty 5**, so the §12.7a pricing rules have something that
    actually exercises them), Trail Hoodie (M/L/XL × Navy/Olive), Canvas Cap, Cotton Socks. Every
    variant carries a valid, distinct auto EAN-13.
  - **Stock is never written directly.** It arrives on **`PUR-00001`**, a real purchase document from
    Rahim Traders, paid in full from Cash — and the seed calls the same `costing.ts` helpers the
    purchase action calls, so the weighted-average cost is *computed*, not asserted. **No sales,
    returns, exchanges or points**: every ledger starts at zero, so any figure seen later is one we
    caused.
  - `scripts/check-seed.ts` reads the result **back out of the DB** and asserts it. The load-bearing
    check is that **stock value at cost (1448.00) equals what the purchase paid (1448.00)** — stock
    and cost are written by different code paths, so their agreeing means the goods on the shelf are
    worth exactly the money that left the drawer. Cash reconciles too (50,000 − 1,448 = **48,552**),
    and every unit on hand has a stock movement behind it (226 = 226).
  - **Browser-verified:** logged in on the fresh DB and the POS grid renders **5 product tiles**
    (not 20 variant tiles) with the right stock and prices, cart empty.
  - ⚠️ **`prisma migrate reset` does not run the seed here** — the schema replays but the DB comes up
    empty. The sequence is `migrate reset` **then** `npx prisma db seed` (§7). The reset did re-prove
    that all 10 migrations replay into an empty database from scratch.

- **Expenses & accounts — BUILT (`BLUEPRINT.md` §18). The biggest hole in the P&L is closed, and
  §15.7 with it.** Migrations `expenses` and `expense_return_link`. Studied the reference app's
  expense module read-only first (list, an *existing* record's edit modal, expense-type master, the
  account ledger, Cash Flow, and their P&L).
  - **What the study actually settled.** Their expense record is **five fields** (date, type, payment
    type, amount, note) with **no account picker** — they get away with it because the shop has exactly
    one account. **We didn't copy that:** an MPoS expense picks a **real account** and posts a
    `Payment` (OUT) that **moves the balance**, like every other document. A payment method not tied
    to an account is a hole in the books waiting to open.
  - Their live data also showed the shape of the work: 55 expenses, **720,797** all-time, six types,
    every one **paid in cash and dated the last day of the month**. So the expense list **defaults to
    this month** (a "today" default would show an empty screen 30 days in 31) and **back-dating is
    first-class** — the P&L keys off the expense *date*, never its creation time.
  - **P&L gains its missing block**: Operating expenses (broken down by type) → **Net profit**. The
    placeholder that read *"expenses are not tracked yet, so gross profit is also the net profit"* is
    gone, replaced by the real figure.
  - **Salary is an expense type, not a subsystem** — theirs is split out because an Employees module
    feeds it; we have none.
  - **Admin-only** on a new **`expenses.manage`** permission — page *and* every server action.
  - ⚠️ **The loyalty accounting question (§15.7) is now answered.** A points redemption posts an
    automatic **"Loyalty points" expense**, so what the scheme costs is finally **visible where profit
    is judged**. It carries **no account** — no cash crossed the counter — exactly like the `POINTS`
    payment and the `EXCHANGE` credit. It makes the cost *visible*, not *paid*. A return posts a
    **negative contra entry** (linked to the return, so undoing the return drops it), and the two net
    to zero: **a fully-returned sale costs the scheme nothing.** Automatic rows are **owned by their
    sale** — the UI renders no edit/delete on them and the server refuses both.
  - 🐛 **Bug found and fixed while wiring the nav:** gating the sidebar meant passing `NavItem`s from
    the server layout to a client component — and a `NavItem` carries its Lucide **icon, which is a
    function**, so every page 500'd. The permissions now cross the boundary instead and the client
    filters. In passing this fixed a wart that had been there since day one: **a cashier could see a
    Settings link that only bounced them** to the dashboard.

  **Browser-verified end to end, every figure checked against the DB.** Rent 25,000 from Cash →
  **cash 48,552 → 23,552** with one OUT payment; P&L showed gross profit 0.00, expenses 25,000,
  **net profit −25,000** (rent and no sales *is* a loss). Then the loyalty round-trip: sold 36 hoodies
  to Karim (Gold 10%) → 1,263.60, earning **120 points**; a second bill of 43.20 redeeming all 120 →
  charged **31.20**, with a **`Loyalty points` expense of 12.00 carrying no account and no payment**,
  and cash up by **only the 31.20 actually taken**. Returning that sale in full gave back **120 points
  as points**, posted the **−12.00 contra**, left **cash untouched**, and netted the loyalty expense to
  **0.00** on the by-type breakdown. `check-reports.ts` now asserts net profit = gross − expenses *and*
  that the loyalty expense equals points spent minus points returned; it reconciles.
  Deleting an expense reverses it (cash went back up by exactly 10.00).

  **The gate was proven by forging the wire, not by trusting the UI.** The genuine `saveExpense`
  server-action call was captured from a real admin save and **replayed from a cashier's session with a
  hostile 9,999 payload** — refused (*"You do not have permission to manage expenses"*), **zero rows
  written**. The cashier's sidebar has no Expenses link and `/expenses` redirects.

- **Stock adjustments — BUILT (`BLUEPRINT.md` §19).** Migration `stock_adjustments`. Stock could
  previously move *only* via buy/sell/return, so a torn shirt could not leave the books at all.

  ⚠️ **The study found the shop has never made a single stock adjustment — not one, 2020→2026** —
  and has **no adjustment types defined**, so their own create form could not even be submitted.
  (Filters were explicitly widened before concluding that, having misread a paginated table earlier
  the same day.) What they actually do: write goods off as a **zero-value sale remarked "Qc Out"** —
  the very invoice that forced free issue (§16) into existence — and send damaged goods **back to the
  supplier** as a purchase return. **Fourth time the shop's own data has corrected an assumption.**

  Built anyway, but for the three things free issue genuinely *cannot* do: **move stock up** (a
  miscount in the shop's favour had no path at all), avoid **inventing a customer and an invoice** for
  a write-off, and report damage **as damage** rather than burying it in net sales as a giveaway.
  - **You type what you counted, never a signed delta** (their model, and it is a good one): pick a
    variant, see what is on hand, type the count — the adjustment is derived and shown before saving,
    so the sign can never come out backwards, and a correction up and a write-off down use one field.
  - **The weighted-average cost does not move.** A lost shirt does not make the remaining shirts
    cheaper or dearer — there are simply fewer of them. Only `stockQty` changes.
  - **The loss lands in the P&L** (§19.6) as an automatic **"Stock loss"** expense at
    `qty × weighted-average cost`, carrying **no account** — the shop lost *goods*, not cash. Stock
    *found* posts a **negative contra**. This is the third user of the "expense with no account" idea,
    after the loyalty credit (§18.8) and the exchange credit (§14) — nothing new was invented.
  - **Admin-only** on a new **`stock.adjust`** permission — it is the easiest place in the app to hide
    theft (type a lower count and the shortfall becomes "damage"), so the gate is on the page *and*
    every server action.
  - **Undo restores stock and takes the loss with it** (the expense cascades). Refused if undoing would
    drive stock negative — i.e. the goods have been sold since.

  **Browser-verified against hand-computed figures.** One document counting **both directions at once**:
  Field Tee M/Navy 10 → counted **4** (−6, loss 36.00 at its 6.00 cost) and Canvas Cap 20 → counted
  **22** (+2, −8.00 found) → net **−4 units, 28.00**. Stock moved, **the average cost stayed at 6.00 and
  4.00**, and **cash never moved** (24,846.80 throughout). The P&L showed **Stock loss (28.00)** in
  Operating expenses and net profit fell by exactly 28.00. **Undo put it all back exactly** — stock 10
  and 20, movements gone, and **zero** Stock-loss expenses left. `check-reports.ts` reconciles.

  **The gate was proven by forging the wire.** The genuine `saveAdjustment` call was captured from a
  real admin save and **replayed from a cashier's session** with a payload counting a variant to zero —
  refused (*"You do not have permission to adjust stock"*), **zero rows written**. The cashier's sidebar
  has no Adjustments link and `/adjustments` redirects.

  *Not browser-tested:* the "undoing would leave negative stock" refusal (it mirrors the purchase guard
  and needed a large throwaway sale to trigger) — covered by code, not by a driven test.

- **Receipt & invoice — BUILT (`BLUEPRINT.md` §20).** Migration `receipt_and_shop_identity`.
  Studied their invoice, print settings and share settings read-only first.

  ⚠️ **This was not "polish" — our receipt had no shop on it.** It was headed **"MPoS"**, the name of
  our *till software*, over a branch address and phone that were **empty in the seed with no UI to fill
  them**. Every customer walked out with a slip that advertised us and told them nothing about the shop
  they had just bought from. Their print settings carry exactly what was missing — **business name,
  address, mobile, email** — and the shop has all of it filled in.
  - **Shop identity now lives in Settings** (§17) and the documents read it. No logo yet: an image needs
    the storage decision §12 has been parking, and a text header is what makes the receipt usable today.
  - **Amount in words** (`src/lib/words.ts`, ours) — *"One Thousand Four Hundred Fifty TK Only"*, which
    **matches their real invoice for the same figure exactly**. A digit can be altered with a pen; a
    sentence cannot. The **currency word is a setting**, so the receipt speaks the shop's language.
  - 🐛 **A schema hole found by the study: change could not be reprinted.** The till showed change and
    then *forgot it* — `Sale` had no `tendered` column, so a reprint could never show what was handed
    over or handed back, and a reprint that disagrees with the slip in the customer's hand is worse than
    no reprint. **`Sale.tendered` added**, sent from the POS (which already knew it and threw it away).
  - **An A4 invoice** beside the 80mm receipt. **PDF is the browser's own Print → Save as PDF** — no PDF
    library, so the printed page and the PDF cannot drift apart.
  - **One loader for all three documents** (`src/lib/invoice.ts`): receipt, A4 and public link read the
    same data, so they can never disagree about what was sold. **It does not even `select` `costAtSale`**
    — this document leaves the building.
  - **Sharing (settled with the user: both).** WhatsApp gets the invoice **as text** (leaks nothing, no
    hosting). A **public link** is the deliberate second step: token is **32 bytes of CSPRNG hex**, minted
    **only on demand** (a sale nobody shared has no public face), **revocable**, and the page is
    **`noindex, nofollow`** — a shared invoice in a search engine would publish a customer's name, phone
    and purchase.

  **Browser-verified.** Set the shop to *Zephyr & Co.*; sold 2 tees + a cap = **30.00**, tendered
  **50.00** → the receipt now prints the **shop's** name and address, **"In words: Thirty TK Only"**, and
  **Cash received 50.00 / Change 20.00** *from the database* — a true reprint, not a leftover of the till
  screen. An older sale with no `tendered` correctly prints **no** cash/change line rather than a fake
  0.00, and renders paisa (1263.60 → *"…Sixty Three TK and Sixty Paisa Only"*). The A4 invoice carries
  lines with SKU and unit, total qty, payment details and signature lines.
  **Link security checked signed-out with `curl`:** valid token **200**, wrong token **404**, malformed
  token **404**, `noindex` present, and **the cost figures (5.00, 4.00) appear nowhere in the HTML**.
  After **Revoke**, the previously-working link **404s**. `check-reports.ts` still reconciles.

### 2026-07-14

- **POS grid filters — BUILT.** The POS grid gets a **category** and a **brand** filter beside the
  search box. Cheap, as expected — but the study of the data turned it into a bug fix.

  ⚠️ **The obvious implementation would have shipped an empty screen.** A product is filed on the
  **deepest** category picked for it (every seeded product sits on a level-3 leaf: Classic Tee is on
  *Apparel › Tops › T-Shirts*, never on *Apparel*). So matching `categoryId` **exactly** — which is
  what the dropdown invites, since it lists all three levels — returns **zero products for every
  category that has children**. Filtering on a category has to mean *"this one and everything under
  it"*.
  - **The subtree rule is written once** (`src/lib/categories.ts`): `getCategoryTree()` (depth-first,
    each node carrying its full `Apparel › Tops › T-Shirts` path) and `categoryFilter()`, which
    expands a category to its whole branch.
  - 🐛 **The same bug was already live in the products list** — `products/page.tsx` matched
    `categoryId` exactly against a flat dropdown of all three levels, so picking *Apparel* or *Tops*
    showed **nothing**. Fixed with the same helper, and **the CSV export route had it too** (an export
    that filtered differently from the page it was launched from is worse than no export). All three
    now share one definition.
  - **The dropdowns show the full path**, not a bare leaf name — two categories can share a name, a
    path cannot.
  - **Only branches that hold a sellable product are offered.** An option that can only ever return an
    empty grid is a dead end the cashier has to discover by clicking it.
  - 🔑 **A scan deliberately ignores the filters.** The barcode names the goods in the customer's hand;
    refusing to ring them up because the grid happens to be narrowed to another brand would be a bug
    wearing a feature's clothes. A *typed search* does respect them — that is browsing.

  **Browser-verified.** *Apparel › Tops* (a level-2 category with **no product filed on it**) pulled in
  the whole branch — Classic Tee, Field Tee, Trail Hoodie — and dropped the Cap and Socks; adding brand
  *Zephyr* narrowed it to the two tees (Trail Hoodie is Northbound). With **both** filters active,
  **scanning the Canvas Cap's barcode — excluded by both — still dropped it straight into the cart** at
  9.00, while *typing* "cap" correctly found nothing. The products list on `?categoryId=2` now reads
  **"3 of 5 products"** (it would have read 0 before), and its **CSV export returns the matching 18
  variants** rather than an empty file. Typecheck + production build pass; `check-reports.ts` still
  reconciles; **no new lint findings** (the 9 existing ones pre-date this).

- **Whole vs decimal units — BUILT (`BLUEPRINT.md` §21). A data-integrity bug, found by the user
  asking a question I had answered too glibly.** Migration `whole_units`.

  ⚠️ **Half a shirt could exist on the books.** Every qty column is `Decimal(14,3)` and `Unit` carried
  **only a name** — no rule — so "Piece" and "Metre" were the same thing to the app. The guard was
  left to the screens, and only **one** of them had it: the POS cart (`step="1"`). The **sale return**,
  **purchase entry** and **stock adjustment** forms were all `step="0.001"`, and no server check
  existed anywhere — `validateReturnLines` only asked whether the qty exceeded what was sold, never
  whether it was a whole number.

  **So MPoS refused to *sell* half a cap while letting you *buy*, *return* and *count* one.** Sell one
  (18 → 17), return `0.5`, and stock becomes **17.5** — half a cap in stock, in the stock valuation and
  in every report that reads them, and **impossible to clear**, because the till only sells whole ones.

  - **The rule lives on the unit, not the screen** (`Unit.allowDecimal`, default **false** — whole is
    both the common case and the safe one). The decimal *columns* stay: 2.5 metres of fabric is real,
    and this schema should outlive one clothing shop.
  - **One rule in one file** (`src/lib/qty.ts`), imported by the forms *and* the server, the same shape
    as `pricing.ts`. Its server companion (`qty-server.ts`) does the unit lookup, so `qty.ts` stays
    Prisma-free and safe to import from client components.
  - **Every write that moves stock is guarded**: purchase, purchase return, POS sale, sale return,
    exchange, stock adjustment, and opening stock. The sale-return and exchange checks sit *inside*
    `validateReturnLines`, so the two paths cannot drift apart.
  - **A product with no unit is treated as whole.** An unset field must never be a licence to create
    fractional stock.
  - **The forms take their `step` from the unit** and round a typed fraction away as it is typed — the
    adjustment screen most strictly of all, because a count is not derived from anything: whatever is
    typed *becomes* the truth.
  - The unit master gets the toggle and a **Whole only / Fractional** column.
  - **Existing fractional stock is never silently rounded** — that would invent or destroy goods. Only
    new writes are guarded. (There was none; checked.)

  **What the reference app settled** (studied read-only 2026-07-14; nothing created, edited or
  deleted): their unit master is **Name + a "Decimal Unit" checkbox**, with a Decimal Unit column on
  the list. ⚠️ **And their live data chose the default:** the shop has **exactly one unit, `PCS`, with
  Decimal Unit = No.** *Fifth time the shop's own data has answered a design question.*

  **Proven by forging the wire, not by trusting the UI.** The return form's qty box now rounds a typed
  `0.5` to `1`, so I rewrote the request body in flight with Playwright and sent the server
  `{"saleItemId":8,"qty":0.5}` anyway. It refused — *"CC-001" is sold in whole pieces — 0.5 is not a
  whole number."* — and **wrote nothing**: cap stock still **18** (not 18.5), no return row, cash
  unchanged at 24,876.80, and **no fractional stock anywhere in the database**.

  **And the rule cuts both ways, which is the point.** Added *Cotton Fabric* (unit **Metre**,
  `allowDecimal`), bought **2.5 m** through the ordinary purchase form → accepted, stock **2.5**, while
  the Canvas Cap's qty box stays `step="1"` and its stock stays whole. The only fractional stock row in
  the DB is the one that is *supposed* to be fractional. Typecheck + build pass; `check-reports.ts`
  reconciles; no new lint findings.

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
- ✅ **Exchange done** — swap goods at the POS against the invoice they went out on. A return and a
  sale in one transaction; the credit is what the customer actually paid, never typed. `/exchanges`
  lists them. Browser-verified both ways (even swap moves no money; an excess is refunded).
- ✅ **Reports done** — Overview, Sales (grouped by invoice/day/month), Profit & Loss, Product
  profit, Dues. Print + CSV + Excel export on each. Profit is Admin-only. Browser-verified.
- ✅ **Free issue & sale remark done** (`BLUEPRINT.md` §16) — goods can leave at 0.00 as a declared
  QC write-off: **Admin-only** (`sales.free_issue`), **remark mandatory**, and the minimum sale price
  still binds every *priced* line. The P&L books it as a loss of what the goods cost. Both gates
  verified against a **forged checkout payload**, not just the UI.
- ✅ **Loyalty points done** (`BLUEPRINT.md` §15) — earn rule is a **repeating threshold**
  (`floor(bill ÷ earnAmount) × earnPoints`, defaulting to the shop's real 10-per-100 at 0.10/point,
  a 1% return). Redemption is a **payment in points**, capped at 50% of a bill and gated on a
  100-point minimum. Points **reverse with the goods**, and points spent **come back as points** —
  they can never launder into cash. Full `PointEntry` ledger behind every balance.
- ✅ **Settings done** (`BLUEPRINT.md` §17) — `/settings` is a real page at last (it 404'd from the
  sidebar since day one). One typed row; Admin-only; holds the loyalty rule and the default alert
  quantity. Shows a live worked example of what the rule costs before you save it.
- ✅ **Expenses & accounts done** (`BLUEPRINT.md` §18) — expense types + expenses, each posting a real
  `Payment` that **moves the account balance**. **Admin-only** (`expenses.manage`). The P&L now carries
  an **Operating expenses** block and a **Net profit** line: gross profit is no longer mistaken for what
  the shop made. **The loyalty scheme's cost is visible at last** — a redemption posts an automatic
  `Loyalty points` expense with **no account** (no cash moved), reversed by a contra entry when the
  goods come back. Browser-verified; the permission gate proven against a **forged wire payload**.
- ✅ **Stock adjustments done** (`BLUEPRINT.md` §19) — damage, theft and miscounts. You **count** what
  is on the shelf and the adjustment is derived, so the sign can never be typed backwards; stock moves
  but the **weighted-average cost does not**. The loss posts to the P&L as a **Stock loss** expense at
  cost, with **no account** (goods lost, not cash); stock found posts a negative contra. **Admin-only**
  (`stock.adjust`), proven against a **forged wire payload**. ⚠️ Worth knowing: the reference shop has
  **never made one** — they write off via a zero-value "Qc Out" sale (§16). We built it for what free
  issue cannot do: move stock **up**, and report damage as damage rather than as a giveaway.
- ✅ **Receipt & invoice done** (`BLUEPRINT.md` §20) — the receipt finally carries **the shop's own name,
  address, phone and email** (from Settings) instead of being headed with our software's name. Plus
  **amount in words**, **cash-and-change that survive a reprint** (`Sale.tendered` — it was not stored at
  all), an **A4 invoice**, **PDF via the browser's own print**, and **sharing**: WhatsApp as text, plus an
  optional **public link** (32-byte CSPRNG token, minted on demand, revocable, `noindex`, no cost data).
  All three documents read **one loader**, so they cannot disagree.
- ✅ **POS grid filters done** — category + brand, beside the search box. A category filter means
  **the category and everything under it** (products are filed on the deepest leaf, so an exact match
  would return an empty screen); the rule lives once in `src/lib/categories.ts` and is shared by the
  POS, the products list and the CSV export — **the latter two had the exact-match bug live.** A scan
  ignores the filters by design; a typed search respects them.
- ✅ **Whole vs decimal units done** (`BLUEPRINT.md` §21) — `Unit.allowDecimal` decides whether a
  fraction of a thing is a real thing. **Half a shirt can no longer be bought, returned, counted or
  sold**: one rule (`src/lib/qty.ts`), enforced by every stock-moving write on the server and by every
  qty box in the UI. Metres and kilos still take 2.5. Proven against a **forged wire payload**.
- 🎉 **PHASE 1 IS COMPLETE**, and Phase 2 is under way (Expenses → Stock adjustments → Receipt & invoice). The app runs the
  whole retail loop end to end: buy stock in → sell it → take it back → and know the **net** profit, the
  margin, and who owes what in both directions.
- ✅ `BLUEPRINT.md` §7 (Purchases), §8 (Customers), §9 (POS), §10 (Sale returns), §11 (Reports) hold
  their requirements (written before building, per protocol).
- ⬜ `middleware.ts` not added (protection currently via the `(app)` layout `auth()` guard — fine; add later for edge-level defense-in-depth).
- ✅ **Sale returns credit what the customer actually paid** (the bill's discount is apportioned
  across the lines) — fixed and proven by round-trip: fully returning a sale lands the customer's
  balance exactly where it started. See `BLUEPRINT.md` §10.1a.
- ✅ **Reports reviewed by a multi-agent code review at high effort**; all 10 confirmed defects fixed
  (money math, the `reports.view` gate on screens, two 500s, and the totals/links/rounding nits).
- ⬜ **`Sale.due` is not reduced by a return** — a return settles against the *customer's account
  balance*, never the invoice. So a fully-returned credit sale still shows its original due on the
  Sales and Dues reports, while the customer's ledger is correctly square. Both numbers are
  internally consistent (invoice-level vs account-level), but decide deliberately whether an
  invoice's due should close when its goods come back. **Not a bug we hit; a modelling choice to
  settle.**
- ⬜ Deferred to Phase 2 (out of scope for the purchases module): purchase orders, stock
  adjustments, supplier advances/due-dismiss, attachments, areas & contact groups.

- ✅ **The dev DB is clean** (re-seeded 2026-07-13, replacing six modules' worth of verification
  leftovers). Rebuild it any time with `npx prisma migrate reset --force && npx prisma db seed`, and
  check it with `npx tsx scripts/check-seed.ts`.
  **Since the re-seed, verifying Expenses added:** a `Space Rent` expense (25,000, from Cash),
  `INV-00001` (36 hoodies to Karim, 1,263.60), `INV-00002` (43.20, 120 points redeemed) and
  `SRT-00001` (that sale returned in full → Karim holds **120 points** again and is owed **31.20**).
  Cash sits at **24,846.80**. Verifying Stock adjustments then added reason **Damage** and
  **`ADJ-00001`** (Field Tee M/Navy counted 4 of 10 → **−6**, a **36.00** stock loss).
  Receipt work then set the shop to **Zephyr & Co.** in Settings and added `INV-00003`
  (2 tees + a cap = 30.00, tendered 50.00 → change 20.00).
  Verifying the whole-unit rule (§21) then added a **Metre** unit (`allowDecimal`), the product
  **Cotton Fabric** (`FAB-001`) and **`PUR-00002`** (2.5 m @ 3.00 from Rahim Traders) — kept on purpose:
  it is the only thing in the DB that exercises the *decimal* half of the rule, the way Field Tee
  exercises the price floor. It is the sole fractional stock row, and it is meant to be.
  Re-seed before the next module if you want a clean slate.

**Dev logins** (both seeded): `admin` / `admin123` (Admin — sees everything) · `cashier` /
`cashier123` (Cashier — no cost, no profit; use it to check the permission gates).

**What is in the DB after a seed** — a coherent starting point, not leftovers:
- **Accounts:** Cash **48,552.00** (a 50,000 float, less the opening purchase), Bank 0.
- **Catalogue:** 5 products / 20 variants, all with valid EAN-13s — *Classic Tee* (S/M/L × Red/Navy,
  12.00), *Field Tee* (S/M/L × Navy/Olive, 12.00, **min sale price 9.00**, **wholesale 10.00 @ qty 5**),
  *Trail Hoodie* (M/L/XL × Navy/Olive, 39.00), *Canvas Cap* (9.00), *Cotton Socks* (3.50, wholesale
  2.80 @ qty 10).
- **Stock:** all of it from **`PUR-00001`** (supplier *Rahim Traders*, 1,448.00, paid in full, so the
  supplier starts square). Stock value at cost = **1,448.00**, which is exactly what the purchase paid.
- **Customers:** *Walk-in*, *Karim Mia* (**Gold**, 10% off) and *Nadia Rahman* — all at **zero** due
  and **zero** points.
- **Nothing else:** no sales, returns, exchanges, points or held carts. Every figure you see after
  this is one you caused.

## 6. Next steps (resume here)

**Phase 1 is complete, Products round 2 closed the catalogue hole, and Exchange is built.** What comes
next is now chosen from the reference shop's *own data* rather than from the reference software's
feature list (see the 2026-07-11 log entry — that method already deleted one wrong priority).

~~1. Sale remark + allow a zero-value sale~~ — ✅ **DONE 2026-07-13** (`BLUEPRINT.md` §16). See the
progress log.

~~1. Wipe and re-seed the dev DB~~ — ✅ **DONE 2026-07-13.** The DB is now a clean, coherent starting
point (base data + a 5-product catalogue whose stock arrived on a real purchase). See the progress log.

~~2. Expenses + accounts, and the loyalty accounting question (§15.7)~~ — ✅ **DONE 2026-07-13**
(`BLUEPRINT.md` §18). Both closed — the P&L has a Net profit line at last, and the loyalty scheme's
cost is visible in it. See the progress log.

~~3. Stock adjustments~~ — ✅ **DONE 2026-07-13** (`BLUEPRINT.md` §19).
~~4. Receipt polish~~ — ✅ **DONE 2026-07-13** (`BLUEPRINT.md` §20). It turned out to be more than
polish: the receipt had no shop identity on it at all, and change was never stored.

~~5. POS grid filters~~ — ✅ **DONE 2026-07-14.** It also uncovered and fixed a live exact-match
category bug in the products list *and* the CSV export. See the progress log.

~~6. Whole vs decimal units~~ — ✅ **DONE 2026-07-14** (`BLUEPRINT.md` §21). A live data-integrity bug:
half a shirt could be bought, returned and counted, though not sold. See the progress log.

**START HERE (next session).**

1. **Settle the `Sale.due` question** (see §5) — a modelling decision, not a bug: should an invoice's
   due close when its goods come back? Today a return settles against the *customer's account*, never
   the invoice, so a fully-returned credit sale still shows its original due on the Sales and Dues
   reports while the customer's ledger is correctly square. **Ask the user, then make it so.**

**Then, in rough order of value:**

2. The rest of Phase 2 (see `BLUEPRINT.md` §5): employees/salary (**salary is an expense type
   today** — it earns its own subsystem when there are employees to attach it to), VAT (only if it is
   actually needed), quotations.
3. Still open from §20: a **shop logo** on the receipt — deliberately deferred, because an image needs
   the **storage decision** §12 has been parking (where do uploaded files live?). Settle that once and
   it unblocks product images too.
4. Housekeeping: `middleware.ts` for edge-level route protection. Still open from §12: **product image
   upload** (ours is a pasted URL — needs a storage decision), **per-language product names**, and a
   **Product Groups** master.

**Build only on request — no trace of these in the shop's actual sales** (§13): wholesale cart mode
(ask: do they sell to resellers?), delivery charge, cheque details, back-dated sale date.
**Dropped** — the shop's own data killed it: line price/discount override with a manager password.
**Skip** — wholesale/grocery ideas, not clothing: instalments, carton selling.
**Deferred, needs HTTPS:** in-POS camera barcode scanning (§13.7). A phone paired as a Bluetooth
keyboard already types into the search box today and needs no code.

*(Loyalty points, Settings, and Free issue & sale remark — all done 2026-07-13. Exchange, Products
round 2, Reports, Sale returns, POS, Customers, Purchases — all done 2026-07-11. Reports were
reviewed and hardened by a multi-agent review.)*

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

# 4. Seed: base data (users, accounts, walk-in, settings) + a demo catalogue
npx prisma db seed

# 5. Dev server
npm run dev            # http://localhost:3000

# Rebuild the DB from scratch (DESTRUCTIVE — dev only; wipes every row):
npx prisma migrate reset --force   # drops the DB and replays all migrations…
npx prisma db seed                 # …but does NOT seed, so seed it yourself
npx tsx scripts/check-seed.ts      # read the result back and assert it

# Other:
npm run build          # production build
npx tsx scripts/dbcheck.ts        # quick DB connectivity check
npx tsx scripts/check-seed.ts     # assert the seeded DB is coherent — the real check is that
                                  # stock value at cost equals what the opening purchase paid
npx tsx scripts/check-reports.ts  # recompute every report figure from the raw rows and
                                  # assert the reports agree — including that product profit
                                  # reconciles exactly with the P&L's gross profit
```

**Key files:**
- `prisma/schema.prisma` — data model · `prisma.config.ts` — Prisma config (DB url via dotenv)
- `src/lib/prisma.ts` — Prisma client singleton (pg adapter)
- `src/app/` — Next.js App Router · `.env` — `DATABASE_URL` (git-ignored)
