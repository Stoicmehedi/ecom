# Retail POS + Inventory — Product Blueprint

An original point-of-sale and inventory management system for a **single retail store**.
This document is our own product spec, informed by general market research into the retail-POS
category. All UI, code, branding, and copy are to be **original** — not modeled on or copied from
any specific third-party product.

> **Design rule:** the UI must have its own distinct visual identity. Do not imitate the look,
> layout, or branding of any existing commercial POS product.

---

## 1. Product summary

A retail store's daily driver: ring up sales fast, track stock accurately, know who owes what,
and see the numbers. Scoped to **one store, one company** (no multi-tenant SaaS, no multi-branch
for now — though the schema keeps a `branch_id` so we can grow into it later).

Core domains:
- **Products & Inventory** — catalog with variants, category hierarchy, brands, units; stock with weighted-average costing
- **Purchasing** — purchase entry, purchase orders, returns, supplier payables
- **Sales / POS** — fast checkout, returns & exchanges, hold/park sales
- **Contacts (CRM)** — customers & suppliers with accounts-receivable/payable ledgers, loyalty points
- **Accounting** — cash/bank accounts, ledgers, expenses, assets
- **HR** — employees, salaries, sales commissions
- **Reporting** — sales, stock, profit/loss, VAT, ledgers
- **Config** — business settings, roles & permissions (RBAC)

---

## 2. Tech stack (decided)

- **Next.js (App Router)** — full-stack TypeScript, one repo
- **PostgreSQL 16** + **Prisma** ORM
- **tRPC** (or server actions) for a type-safe API
- **Tailwind CSS + shadcn/ui** for UI (with an original theme/identity)
- **Auth.js** + a roles/permissions table for RBAC
- Later: react-pdf/Puppeteer for invoices, PWA for offline POS

Local dev DB: `postgresql://ecom:ecom@localhost:5432/ecom`

---

## 3. Core data model (single-store scope)

Entities and key fields. `→` = FK.

### Catalog
- **product** — name, `category_id →`, `sub_category_id`, `child_category_id`, `brand_id`, `unit_id`,
  `product_group_id`, type (`simple|variable`), image, status, `created_by`
- **category / sub_category / child_category** — name + parent FK (3-level hierarchy)
- **brand**, **unit**, **product_group** — name masters
- **attribute** (e.g. Size) & **attribute_group**; **color** — variant dimensions
- **product_variant** — `product_id →`, sku/barcode, `color_id`, attribute values,
  purchase_price, selling_price, wholesale_price, stock qty
- barcode/label print templates

### Purchasing
- **purchase** — `supplier_id →`, invoice_no, date, due_date, reference, note, attachment,
  subtotal, discount, total, paid, due, status
- **purchase_item** — `purchase_id →`, `variant_id →`, qty, purchase_price, subtotal
- **purchase_order**, **purchase_return** (+ return_type)
- **stock_adjustment** — `variant_id`, qty ±, reason/type

### Sales
- **sale** — invoice_no, date, `customer_id →`, `employee_id (sold_by)`, channel,
  items_count, subtotal, discount, vat, total, paid, due, payment_status, remark, note
- **sale_item** — `sale_id →`, `variant_id →`, qty, price, discount, subtotal, **cost_at_sale**
- **sale_return / exchange** — links original sale, returned items, refund/exchange delta
- **held_sale** — parked cart

### Contacts & ledgers
- **contact** — type (`customer|supplier`), name, mobile, email, address, `area_id`,
  `customer_group_id`, loyalty_points, opening_balance
- **ledger_entry** — `contact_id`, date, debit, credit, ref, running balance
- **customer_group**, **area**

### Accounting
- **account** — type (cash/bank), name, bank fields, opening balance
- **transaction** — `account_id`, date, debit, credit, type, ref
- **expense** — `expense_type_id`, amount, date, account, note
- **asset** — `asset_category_id`, name, value, date

### HR
- **employee** — name, designation, `branch_id`, email, mobile, national_id, image, address, joining_date, salary
- **salary_payment**, **sales_commission**

### Config / access
- **user** — name, username, email, password_hash, `role_id`, `branch_id`
- **role** + **permission** — granular `module.action` RBAC
- **business_setting** — profile, currency, VAT%, invoice prefix/suffix, formats, feature toggles, logo
- **loyalty_rule** — min_invoice_amount, reward_points, conversion_rate, is_repetitive
- **branch** — single row for now; column retained for future multi-branch

---

## 4. Key flows to get right

1. **POS sale** — filter/scan → cart (qty, line discount) → customer (walk-in default) →
   totals (VAT %, discount, payable) → payment (cash/bank, due allowed) → decrement variant
   stock → post ledger + account transaction → print/hold. Support Hold (park) & Exchange.
2. **Purchase (stock-in)** — supplier → line items at purchase price → recompute weighted-average
   cost per variant → increment stock → supplier payable/ledger.
3. **Return/Exchange** — reverse stock & ledger; exchange = return + new sale with delta payment.
4. **Costing & P&L** — each sale item stores cost at time of sale → product-wise profit/loss.
5. **AR/AP** — due/paid tracking on every sale & purchase; due-collection posts to ledgers.

---

## 5. Build roadmap

**Phase 1 (MVP — the sellable heart):**
- Auth + basic roles (Admin, Cashier)
- Products (simple + variable), categories (3-level), brands, units, barcode
- Stock (weighted-avg cost) + purchase entry (supplier + payable)
- POS checkout (scan, cart, discount, VAT, hold, payment, print invoice)
- Customers + suppliers with due/paid ledger
- Sales list, sale return
- Core reports: daily/monthly sales, stock, profit/loss, customer/supplier due

**Phase 2:**
- Exchanges, quotations, stock adjustments, expenses/assets
- Accounts (cash/bank, deposit/withdraw, expense posting)
- Employees + salary + sales commission
- Loyalty points, customer groups/areas
- Full report suite + PDF/Excel export
- SMS + delivery/courier integrations

**Deferred:** multi-tenant SaaS, multi-branch, manufacturing, installments, warranty,
e-commerce storefront + online-order fulfillment.

---

## 6. Open decisions

> **Policy:** remaining open items are raised and decided **at the start of the module that
> needs them**, not upfront.

- [x] **Keep `branch_id` from day 1** — yes; single default "Main Store" branch seeded. *(done)*
- [x] **Original visual identity** — MPoS, emerald accent, "M" mark, Geist type. *(done)*
- [x] **Receipt / invoice format** — 80mm thermal receipt as the POS default + optional A4
      invoice for formal/credit sales; rendered via a print-styled page / PDF. *(decided 2026-07-09;
      implement in the POS module)*
- [~] **SKU / barcode scheme** — SKU auto-generates (`SLUG-XXXXX`) with manual override *(done)*.
      Open: whether to auto-generate scannable barcodes (numeric / EAN-13) — **decide when building
      barcode/label printing.**
- [ ] **Bangla + English i18n** — English-only for now; revisit before it becomes costly.
      **Decide when a module first needs localized UI.**
- [x] **Purchase numbering** — our own unique `PUR-00001` sequence, **plus** a separate optional,
      non-unique "supplier invoice no." field. *(decided 2026-07-11)*
- [x] **Purchase edit/delete** — allowed only while none of the purchased stock has been sold;
      blocked afterwards, to stop stock/cost drift. *(decided 2026-07-11)*
- [x] **Split payments on a purchase** — yes, multiple `method + account + amount` rows.
      *(decided 2026-07-11)*
- [x] **Purchases module scope** — suppliers, purchase entry, list/detail, stock view, purchase
      returns, and supplier due-payment. *(decided 2026-07-11)*

---

## 7. Module requirements — Purchases & Stock

> Written before building, from a read-only study of the reference app's purchase flow
> (2026-07-11). Our own words, our own UI. Domain logic only.

### 7.1 Suppliers (prerequisite)

Purchases need a supplier, and we have no Contacts UI yet. Build the minimum:

| Field | Required | Notes |
|---|---|---|
| Name | ✅ | |
| Phone / mobile | ✅ | |
| Business name | — | trading name, distinct from contact person |
| Email, Address | — | |
| Opening balance (due) | — | what we already owe them on day 1 |
| Opening advance | — | what we've prepaid them |
| Note | — | |

List columns: Name, Phone, Total purchased, Total paid, **Total due**.
(Reference also has Area / customer-group / due-dismiss — **deferred**, not our scope.)

### 7.2 Purchase entry — the core flow

**Header**

| Field | Required | Behaviour |
|---|---|---|
| Supplier | ✅ | picker + inline quick-add |
| Purchase date | ✅ | defaults to today |
| Purchase no. | auto | **our own** unique sequence (e.g. `PUR-00001`) |
| Supplier invoice no. | — | free text, **not unique** — the supplier's own number; may legitimately repeat |
| Due date | — | when the payable falls due |
| Reference, Note | — | |
| Attachment | — | **deferred** (no file storage yet) |

**Line items** — search by name / SKU / barcode → adds a row per **variant**:

`Product (variant) | Qty | Purchase price | Line subtotal`

- Qty allows decimals (units like kg). Must be **> 0**.
- Purchase price **pre-fills from the variant's current cost** but is editable — this purchase's actual price.
- Line subtotal = qty × purchase price.
- Same variant scanned twice → increment the existing row, don't duplicate it.
- A purchase must have **at least one line**.

**Totals & payment**

- Subtotal = Σ line subtotals
- Order discount — **Amount or Percentage** (a toggle; percentage resolves to an amount)
- Grand total = subtotal − discount
- **Split payments**: one or more rows of `Method (Cash / Mobile banking / Card / Bank) + Account + Amount`
- Paid = Σ payment amounts; **Due = grand total − paid** (may be 0, partial, or full credit)
- Status derives from due: `PAID` / `PARTIAL` / `DUE`

### 7.3 What saving a purchase MUST do (downstream effects)

This is the part that matters. In one transaction:

1. **Increase variant stock** by the purchased qty.
2. **Recompute the variant's weighted-average cost:**
   `newAvg = (oldQty × oldAvg + purchaseQty × purchasePrice) / (oldQty + purchaseQty)`
   Guard the zero/negative-stock denominator (fall back to the purchase price).
3. **Record the last purchase price** on the variant. The reference tracks *both* — average
   purchase price (for valuation and profit) **and** last purchase price (for reordering).
   → our `ProductVariant` needs a `lastPurchasePrice` alongside the weighted-average `purchasePrice`.
4. **Write a `StockMovement`** row (type `PURCHASE`, +qty, ref = purchase) — the audit trail.
5. **Post the payable**: increase the supplier's due by the grand total, decrease it by what was paid.
6. **Record each `Payment`** (direction `OUT`) against its account.

### 7.4 Stock / inventory view

Per-product (and drill-down per-variant), matching what the reference exposes:

`Product | Avg. purchase price | Last purchase price | Selling price | In qty | Out qty | Stock | Stock value @ cost | Stock value @ selling`

- Stock = In − Out, derived from stock movements (movements are the ledger; `stockQty` is the cache).
- Stock value @ cost = stock × avg purchase price. *(Verified against their numbers: 4 × 650 = 2600 ✅)*
- Also worth having: a **low-stock** filter.

### 7.5 Purchase return

Return against an existing purchase:

- Supplier is fixed (inherited from the purchase); return date; **return type is required**
  (a small master: Damaged / Wrong item / Excess — seeded).
- Per line: shows `Purchased qty | Used qty | Available qty | Return qty`.
- **Hard rule: return qty ≤ available qty**, where available = purchased − already sold/consumed.
  You cannot return stock you've already sold.
- Effects: **decrease** variant stock, write a `PURCHASE_RETURN` movement, reduce the supplier
  payable, and optionally record a refund received (`Cash / Mobile banking / Card / Bank`).

### 7.6 Editing / deleting a purchase

The reference allows both. Both must **fully reverse** the original stock movements and payable
before re-applying — otherwise stock and cost silently drift. Safer stance for us: block edit/delete
once any of the purchased stock has been sold (same guard we already use on product delete).

### 7.7 Explicitly out of scope for this module

Purchase orders (separate flow), stock adjustments, due-dismiss/write-off, supplier advances,
attachments, areas & contact groups. These land in Phase 2.
