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

- [ ] Keep `branch_id` dimension from day 1 (recommended: yes, default 1)
- [ ] Invoice/receipt format (thermal 80mm vs A4) + printing approach
- [ ] Per-variant SKU/barcode generation scheme
- [ ] Bangla + English i18n from the start?
- [ ] Original visual identity: name, logo, color system, typography (must be distinct)
