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
- [x] **Customer groups** — build with the Customers module (name + default discount %); POS
      pre-fills the sale discount from the customer's group, overridable per sale. *(decided 2026-07-11)*
- [x] **Customer required fields** — **phone only**; name is optional (fast counter entry, phone is
      the lookup key). Blank names fall back to a placeholder. *(decided 2026-07-11)*
- [x] **Overselling at POS** — **blocked**. Checkout refuses and names the short item; stock can
      never go negative, so cost valuation stays trustworthy. *(decided 2026-07-11)*
- [~] **VAT** — **skipped for now**; the `vat` column stays 0 and no VAT line shows on a sale.
      Revisit when VAT invoices are actually needed (likely a single business-level rate in Settings).
      *(deferred 2026-07-11)*
- [x] **POS scope** — cash-tendered → change due, Hold/park, and an 80mm printed receipt. **No
      delivery charge.** Exchange stays Phase 2. *(decided 2026-07-11)*

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

---

## 8. Module requirements — Customers

> Written before building, from a read-only study of the reference app's customer module
> (2026-07-11). Built ahead of POS, which needs a customer picker.

The mirror image of Suppliers (§7.1): same contact record, same ledger shape, but the money flows
the other way — a customer's balance is a **receivable** (they owe us), and we **receive** dues
rather than pay them.

### 8.1 Customer record

| Field | Required | Notes |
|---|---|---|
| Phone / mobile | ✅ | the only mandatory field in the reference — it's the identity key |
| Name | — | defaults to a placeholder if blank (walk-in trade) |
| Customer group | — | see §8.2 — drives a default discount |
| Business name, Email, Address | — | |
| Opening due | — | what they already owe us on day 1 |
| Opening loyalty points | — | the points balance carries; **earning rules are Phase 2** |
| Note | — | |

List columns: Name, Phone, Group, Total sold, Total received, **Total due**.

### 8.2 Customer groups — a default discount

A small master: **name + discount percentage** (their examples: "Gold 10 P" → 10%). Assigning a
customer to a group gives their sales that discount **by default**, still overridable per sale.
POS depends on this, so it ships with Customers rather than later.

### 8.3 Ledger & receiving dues

- Per-customer **ledger page**: opening balance, then every sale (+), sale return (−), and payment
  received (−), with a running balance that must reconcile to the stored due.
- **Receive due** action: `amount + method + account`, capped at the outstanding due. Records a
  `Payment` (direction `IN`), decreases the customer's due, and increases the account balance.

### 8.4 Walk-in customer

POS needs a default. Seed a single **"Walk-in"** customer used when no one is named. It must not be
deletable, and cash sales to it should not accrue a due.

### 8.5 Out of scope (Phase 2)

Loyalty *earning* rules, membership numbers/cards, areas, customer advances, due-dismiss/write-off,
customer import/export, SMS.

---

## 9. Module requirements — POS checkout

> Written before building, from a read-only study of the reference app's POS screen
> (2026-07-11). Their POS is one dense screen; ours is original, but the *flow* is the same.

### 9.1 The screen

Two columns, built for speed and a barcode scanner:

- **Left — find products.** A search box that matches **product name, SKU, or a scanned barcode**
  (a scan that hits exactly one barcode adds it straight to the cart, no click). Plus
  category/brand filters and a tile grid for touch.
- **Right — the cart.** `Product | Price | Qty | Line total | ✕`, with the customer picker,
  totals, and the checkout button.

### 9.2 The cart

- Scanning/clicking the same variant again **increments its line**, never duplicates it.
- Qty and unit price are editable per line (price override is a supervisor-ish act, but the
  reference allows it plainly, and small shops need it).
- **Customer** defaults to **Walk-in** (§8.4). Choosing a customer with a group **pre-fills the
  order discount** from that group's percentage (§8.2), still overridable.

### 9.3 Totals

`Subtotal → order discount (amount or %) → Grand total`

**VAT is deferred** (§6) — the column stays 0 and no VAT line shows. **No delivery charge.**

**Overselling is blocked** (§6): if any line exceeds what's in stock, checkout refuses and names
the item. Stock never goes negative, so the weighted-average cost stays meaningful.

### 9.4 Payment

- **Split payments**: one or more `method + account + amount` rows (Cash / Mobile banking / Card /
  Bank / Cheque) — same widget as purchases.
- **Cash tendered → change due.** The cashier types what the customer handed over; the screen
  shows the change to give back. This is computed for the drawer only — it is *not* stored as
  part of what was paid.
- **Due** = total − paid. A sale may close with a due (credit sale) → posts to the customer's
  receivable and needs a **due date**.

### 9.5 What checkout MUST do (downstream effects)

In one transaction:

1. **Decrement variant stock** for every line.
2. **Snapshot `costAtSale`** on each line from the variant's current **weighted-average cost**
   (which Purchases maintains, §7.3). This is what makes per-product profit reporting possible —
   it must be captured at the moment of sale, because the average moves later.
3. Write a **`StockMovement`** (type `SALE`, −qty, ref = sale).
4. **Record each `Payment`** (direction `IN`) against its account.
5. **Post the receivable**: increase the customer's due by whatever is unpaid.
6. Assign an **invoice number** from our own sequence (`INV-00001`).

### 9.6 Hold (park a sale)

Park the current cart and start a new one — the shop's "hang on, let me grab another item".
A held sale **touches nothing**: no stock, no ledger, no invoice number. It can be resumed or
discarded.

### 9.7 Receipt

80mm thermal receipt is the POS default, with an optional A4 invoice for credit sales
(already decided in §6). Rendered as a print-styled page.

### 9.8 Sale records

List columns: `Invoice | Date | Customer | Items | Total | Paid | Due | Status | Sold by`.
A saved sale is **not editable** — the reference only offers View / Invoice / Delete, and that's
right: corrections belong in a sale return. Deleting must fully reverse stock, cost, and ledger.

### 9.9 Out of scope for this module (Phase 2)

Exchange (return + new sale with a delta payment), quotations, installments, loyalty *point*
redemption as a payment method, customer advances as a payment method, sales commission, and
backdating a sale behind a manager password.

---

## 10. Module requirements — Sale returns

> Written before building, from a read-only study of the reference app's sale-return screen
> (2026-07-11). The mirror of the purchase return (§7.5), with the goods and the money both
> flowing the other way.

### 10.1 The flow

Start from the invoice: **look up a sale by its invoice number**, then return lines off it. (Ours
also reaches it straight from the sales list, which is fewer clicks than their search-first page.)

| Field | Required | Notes |
|---|---|---|
| Customer, invoice no., sale date | — | read-only, inherited from the sale |
| Return date | ✅ | defaults to today |
| Note | — | |

Per line: `Product | Unit price | Sold qty | Available qty | Return qty | Return subtotal`

- **Available qty = sold − already returned.** Return qty is capped by it.
- Unlike a *purchase* return, there is **no reason/type** field — a customer bringing something
  back doesn't need a reason code.

### 10.2 Refund

`Refund amount + method (Cash / Card / Bank / Mobile banking)`, capped at the return's value.

**A walk-in must be refunded in full.** Crediting a walk-in's "account" would push their balance
negative — a debt we owe to nobody, the mirror of the bug caught in §9. There is no one to credit,
so the money has to go back across the counter.

### 10.3 What saving a return MUST do (downstream effects)

In one transaction:

1. **Increase variant stock** — the goods come back on the shelf.
2. **Re-base the weighted-average cost at `costAtSale`** — the cost the goods left at, which the
   sale line snapshotted (§9.5). Putting them back at today's average would silently rewrite
   history; putting them back at what they cost when they left keeps the valuation honest.
3. Write a **`StockMovement`** (type `SALE_RETURN`, +qty, ref = return).
4. Bump the sale line's **`returnedQty`** so it can't be returned twice.
5. **Settle the money.** The goods coming back cancels that much of what the customer owes:
   `dueBalance −= returnValue`. If we hand cash back instead, the debt stands and the cash leaves:
   `dueBalance += refund`, `account −= refund`.
   Net: `dueBalance += (refund − returnValue)`, `account −= refund`.
6. Assign a return number from our own sequence (`SRT-00001`).

### 10.4 Records

List: `Return no. | Date | Against | Customer | Items | Value | Refunded`.
Deleting a return re-sells the goods: stock back out, `returnedQty` decremented, money re-owed.
