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

---

## 5. Current state

- ✅ Spec written, stack chosen, DB running, repo live.
- ✅ Next.js app scaffolded (Next 16.2, React 19, Tailwind v4), named MPoS.
- ✅ Prisma 7 wired to Postgres via pg adapter; Phase-1 schema migrated (16 tables).
- ✅ **Auth + login + app shell + dashboard working**; build passes; routes protected.
- ✅ **shadcn/ui + MPoS emerald theme** in place (11 components).
- ✅ **Seed data present**: Main Store branch, Admin/Cashier roles, admin user, Cash account.
- ✅ **Login browser-verified**; **Products/Catalog module done** (Categories, Brands, Units, Products+Variants — full CRUD).
- ✅ **Category autocomplete** works (parent-scoped suggestions + reuse-a-name across branches).
- ✅ **Session + module build protocol** documented in `AGENTS.md` (loaded every session via `CLAUDE.md`).
- ✅ **Purchases & Stock module done** — suppliers (+ ledger & due payment), purchase entry with
  weighted-average costing, purchase returns, inventory view. Browser-verified; build passes.
- ✅ **Customers module done** — customers (+ groups with a default discount %, ledger, receive-due),
  walk-in customer seeded for POS. Browser-verified; build passes.
- ✅ `BLUEPRINT.md` §7 (Purchases) and §8 (Customers) hold their requirements (written before
  building, per protocol).
- ⬜ `middleware.ts` not added (protection currently via the `(app)` layout `auth()` guard — fine; add later for edge-level defense-in-depth).
- ⬜ POS, Sales, Reports modules not built yet.
- ⬜ Deferred to Phase 2 (out of scope for the purchases module): purchase orders, stock
  adjustments, supplier advances/due-dismiss, attachments, areas & contact groups.

**Dev login:** `admin` / `admin123`

**Dev data now in the DB** (from end-to-end verification): supplier *Rahim Traders*, purchase
`PUR-00001` (10 × 8.00), return `PRT-00001` (2 units) → Classic Tee at **28 in stock, avg cost 5.86**.
Customers: *Walk-in* (seeded), *Karim Mia* (Gold group, 300 due), and a phone-only customer.
Wipe and re-seed if you want a clean slate.

## 6. Next steps (resume here)

1. **POS checkout** — the next module. Follow the module build protocol in `AGENTS.md`: study the
   reference app's POS/sale screen first (fields, mandatory vs optional, validation, what saving does
   to stock, customer dues, and accounts), write it into `BLUEPRINT.md` §8, settle any §6 open
   decision it touches (the **receipt format** is already decided: 80mm thermal + optional A4), then
   build. Must: scan/search → cart → discount/VAT → payment → **decrement stock**, record the sale
   with `costAtSale` (we now have a real weighted-average cost to snapshot), post customer dues, and
   print. Support Hold/park.
2. **Sales list & sale returns**, then **core reports** (see `BLUEPRINT.md` §5).

*(Customers — done 2026-07-11. The POS customer picker should default to the seeded **Walk-in**
customer and pre-fill the sale discount from the customer's group.)*

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
npx tsx scripts/dbcheck.ts   # quick DB connectivity check
```

**Key files:**
- `prisma/schema.prisma` — data model · `prisma.config.ts` — Prisma config (DB url via dotenv)
- `src/lib/prisma.ts` — Prisma client singleton (pg adapter)
- `src/app/` — Next.js App Router · `.env` — `DATABASE_URL` (git-ignored)
