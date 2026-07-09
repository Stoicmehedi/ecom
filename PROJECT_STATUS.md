# Project Status

> **Single source of truth for this project.** Committed to the repo so anyone — any machine, any
> account — can understand the full state without relying on private notes. **Update this file after
> every task.**

**Last updated:** 2026-07-09
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

---

## 5. Current state

- ✅ Spec written, stack chosen, DB running, repo live.
- ✅ Next.js app scaffolded (Next 16.2, React 19, Tailwind v4), named MPoS.
- ✅ Prisma 7 wired to Postgres via pg adapter; Phase-1 schema migrated (16 tables).
- ✅ MPoS landing page renders with live DB status; production build passes.
- ⬜ No auth yet (Auth.js not set up).
- ⬜ No shadcn/ui components yet.
- ⬜ No feature modules built yet (products, POS, etc.).
- ⬜ No seed data (DB is empty).

## 6. Next steps

1. Seed base data: default Branch, Admin/Cashier roles, an admin User, a Cash Account.
2. Set up Auth.js (credentials login) + roles/permissions + a protected app shell/layout.
3. Add shadcn/ui with the MPoS theme (emerald accent).
4. Build Phase-1 modules (see `BLUEPRINT.md` §5): products/catalog → stock/purchase → POS → sales/returns → core reports.

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
