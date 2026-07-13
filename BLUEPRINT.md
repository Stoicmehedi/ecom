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
- [x] **SKU / barcode scheme** — SKU auto-generates (`SLUG-XXXXX`) with manual override *(done)*.
      Barcodes auto-generate as **EAN-13 in the in-store `20` range**, check digit included, and stay
      editable. *(decided 2026-07-11 — see §12.7)*
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
- [x] **Who sees profit** — **Admin only.** Cost, profit and margin need `reports.profit`; cashiers
      get sales, dues and stock without cost. Roles, not the reference app's second admin password.
      *(decided 2026-07-11)*
- [x] **Returns vs. profit** — sale returns **reduce gross profit**, not just net sales: the return
      line carries both the price it sold at and the cost it left at, so both sides reverse. (The
      reference app does not do this, and overstates profit.) *(decided 2026-07-11)*
- [x] **Report export** — print view + **CSV** + real **Excel `.xlsx`**. *(decided 2026-07-11)*
- [x] **Report set** — Overview, Sales (grouped by invoice/day/month), Profit & Loss, Product profit,
      Dues; stock valuation stays on the Inventory screen. *(decided 2026-07-11)*
- [x] **A bill's discount belongs to its lines.** Wherever a line's revenue matters — crediting a
      return (§10.1a), counting product profit (§11.6) — it is `list × (subtotal − discount) /
      subtotal`, never the list price. One helper (`paidRatio`) so the rule can't drift between
      callers. *(decided 2026-07-11)*

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

### 10.1a Pricing a return — credit what they actually paid

A discount is given on the **bill**, but it is really a reduction on every line in it. A shirt listed
at 12.00 on a bill discounted 10% went out the door at **10.80** — so 10.80 is what must be credited
if it comes back. Crediting the 12.00 list price hands back money that was never taken, and it scales
with the discount: 30% off means over-refunding by 30% of the returned goods, every time.

So a return line is priced at `list price × (subtotal − discount) / subtotal` — the same
apportioning the product-profit report does (§11.6), from the same helper (`paidRatio`). The return
form shows the adjusted price and says why.

**The test:** return every line of a sale and the customer's balance must land *exactly* back where
it was before the sale. *(Fixed 2026-07-11 — it previously landed in the customer's favour.)*

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

---

## 11. Module requirements — Reports

The reference app ships **43 report screens**. Most are slices of the same few questions, or belong
to Phase-2 modules we don't have (salary, expenses, VAT, delivery, commission, quotations,
installments, expiry, forecast). Studying them, everything Phase 1 owes the shopkeeper collapses
into **five screens**, each answering a question a shop actually asks:

| Report | The question it answers |
|---|---|
| Overview | How did the shop do over this period? |
| Sales | What did we sell, to whom, and was it paid? |
| Profit & Loss | Did we make money — and how much? |
| Product profit | Which products earn, and which just sit there? |
| Dues | Who owes us, and who do we owe? |

Stock valuation is already answered by the **Inventory** screen (§7.4); we extend that with filters
and export rather than build a near-duplicate "Stock report".

### 11.1 Shared shape — every report

- **Date range** with quick presets: Today · Yesterday · This week · This month · Last month ·
  This year. Default **Today** (as the reference does). Reports over stock-on-hand (Inventory) are a
  snapshot of *now* and take no date range.
- **A totals row** — every numeric column foots. This is the single most-used feature of their
  report screens and it is never optional.
- **Export: print view, CSV, and Excel (`.xlsx`).** *(decided 2026-07-11)* Print hides the app shell
  and lays out for A4, the same trick the 80mm receipt uses (§9.7).
- A report is a **read-only projection**. No report screen ever writes.
- Filters live in the URL (`?from=…&to=…`), so a filtered report is linkable, refresh-safe, and the
  export endpoint can reuse the exact same query string.

### 11.2 Who may see profit

**Profit, cost, and margin are Admin-only.** *(decided 2026-07-11)* A cashier may open Sales, Dues,
and Inventory-without-cost; the P&L and Product-profit screens are refused outright, and cost/profit
columns are dropped from any shared screen. New permission keys: `reports.view` (the basic set) and
`reports.profit` (anything revealing cost or margin).

The reference app gates its profit report behind a **second admin password** typed into the report
form. We get the same protection from the role system we already have, without a second secret to
manage — so we use roles, not a password prompt.

### 11.3 Overview

Tiles for the period: **net sales, gross profit, margin %, invoices, items sold, average sale**,
plus **cash in / cash out** and **new dues raised**. A small day-by-day sales bar for the range.
Profit tiles are hidden without `reports.profit`.

### 11.4 Sales report

One screen replaces their Daily / Monthly / Yearly / Master / Detail sales reports — those differ
only by **how the same rows are grouped**, so grouping is a control, not five screens:

- **Group by: Invoice · Day · Month.**
- Filters: date range, customer, payment status (Paid / Partial / Due), and the user who sold it.
- Invoice rows: `Date | Invoice | Customer | Items | Subtotal | Discount | Total | Paid | Due |
  Returned | Status`, linking to the sale.
- Day/Month rows: `Period | Invoices | Items | Subtotal | Discount | Net sales | Paid | Due`.
- `Returned` is the value already handed back against that sale, so a sale that came back doesn't
  read as revenue that stuck.

### 11.5 Profit & Loss — the one that has to be right

The reference app's own formula, read off its debit/credit view:

```
Gross profit = Product sales profit − (service charges + expired products)
Net profit   = Gross profit − expenses − salary
```

Two things are worth copying and one is worth **fixing**:

- ✅ **Copy: purchases are not an expense.** Their gross profit is driven by the per-line
  *Product sales profit*, not by "sales − purchases". Buying stock converts cash into inventory; it
  costs you nothing until the goods are sold. Our `costAtSale` snapshot (§9.5) gives us exactly this.
- ✅ **Copy: the P&L is a period cash-and-margin summary,** with purchases and payments shown
  alongside for context even though they don't enter the profit line.
- ❌ **Fix: their returns never reduce gross profit.** A sale return cuts their *net sales* but their
  gross profit still counts the margin on goods that came back — so profit is overstated every time
  something is returned. We net returns out properly: our `SaleReturnItem` carries both the `price`
  it was sold at and the `cost` it left at, so both sides reverse cleanly. *(decided 2026-07-11)*

Ours:

```
Net sales    = gross sales − sale returns (at the price they sold for)
Net COGS     = cost of goods sold − cost of goods returned (at costAtSale)
Gross profit = net sales − net COGS
Margin %     = gross profit / net sales
```

> Their "%" badge is **markup on cost** (profit ÷ cost), not margin on sales. We show **margin on
> net sales** and label it, because that is the number that compares against anything else.

Shown as: a **Revenue** block (gross sales, − returns, = net sales), a **Cost of goods** block
(COGS, − returned cost, = net COGS), then **gross profit + margin %**. Below, an informational
**Cash movement** block (purchases, purchase returns, supplier payments, customer receipts, refunds
paid out) — clearly separated, so nobody mistakes cash for profit. Expenses and salary are Phase 2;
until then gross profit **is** net profit, and we say so on screen rather than printing a fake zero.

### 11.6 Product profit

Per variant over the range: `Product | SKU | Sold qty | Returned qty | Net qty | Sales value |
Cost value | Profit | Margin %`, sorted by profit. Filters: category, brand. Admin-only.

**The order discount has to be shared out across the lines.** A discount is given on the *bill*,
not on a product — so a line's true revenue is `qty × price − (order discount × this line's share of
the subtotal)`. Skip that and the product profits sum to more than §11.5's gross profit by exactly
the discount given, and the two reports quietly disagree. Apportioned, the totals reconcile
**exactly** — same numbers, different cut. That reconciliation is the test that either report is
right.

### 11.7 Dues

Both directions on one screen, two tabs:

- **Receivable** — what customers owe. Per unpaid/partial sale: `Date | Invoice | Customer | Phone |
  Total | Paid | Due | Age (days)`, with a per-customer total. Links to the customer ledger (§8.3).
- **Payable** — what we owe suppliers. Per unpaid/partial purchase: `Date | Purchase | Supplier |
  Total | Paid | Due | Age (days)`, with a per-supplier total.

**Age** is ours, not theirs — a due is only a problem once it is old, and neither of their due
reports shows it.

### 11.8 Out of scope (Phase 2)

Expense, salary, VAT, delivery-charge, commission, quotation, installment, exchange, stock
adjustment, expiry and forecast reports — every one of them depends on a Phase-2 module that does
not exist yet. Their "Summary" (a pure cash-in/cash-out sheet) is folded into §11.5's cash block.

---

## 12. Module requirements — Products, round 2

> **Why there is a round 2.** Products was the first module we built — *before* the module-build
> protocol existed. It never got the field-by-field study every later module got. Going back over the
> reference app's product module properly turned up a large gap: their Products menu has **12**
> entries, we built **4**, and the shape of a variant is fundamentally different. This section is the
> requirements list that should have existed the first time.

### 12.1 What we already have

Categories (3-level, with the quick-add branch dialog they don't have), Brands, Units, and
Products + Variants with SKU/barcode, cost, selling price, opening stock, and safe delete. The
costing, stock and sales machinery hanging off a variant is sound — this section adds to it and does
not rework it.

### 12.2 Variants must be **generated**, not typed — the big one

Theirs: pick an **Attribute Category** (e.g. Size), tick the **Attributes** on it (30, 32, 34, 36,
38, 40), pick the **Colors**, press **Generate Variant** → the full grid appears, one row per
combination. Then an **Apply to All** row bulk-fills price and stock down every row.

Ours: you hand-add each variant row. For a belt in six sizes that is six manual rows; for six sizes ×
four colours it is twenty-four. **This is the difference between a clothing shop being able to use
the app and not.**

So we need three masters we do not have at all:

- **Attribute Category** — a named axis (Size, Fit, Material).
- **Attribute** — the values on that axis (30/32/34…, Slim/Regular), belonging to one category.
- **Color** — a separate axis in their model, with a name (and a swatch is the obvious extension).

…plus **Generate variants** = the cartesian product of the chosen attributes × chosen colours, and
**Apply to all** for the price/stock grid. Regenerating must **never** orphan a variant that already
has stock or sales history — existing rows are matched and kept, only genuinely new combinations are
added, and a row that would be removed but has history is refused (the same rule that already guards
product delete).

Our `ProductVariant.attributes` JSON column is already the right home for `{ size: "32", color:
"Red" }`; today nothing writes it.

### 12.3 Fields on the product we simply don't have

| Field | What it is for | Decide |
|---|---|---|
| **Alert quantity** | per-product low-stock threshold | replaces the hardcoded `LOW_STOCK = 5`; the Inventory low-stock filter and any low-stock report read it |
| **Minimum sale price** | a price floor | **the POS must refuse to sell below it** — it is a rule, not a hint |
| **Wholesale quantity** | the qty at which the wholesale price applies | we already carry `ProductVariant.wholesalePrice` and **nothing reads it** — it is dead half-built code today. Either wire it up or drop the column |
| **Discount % / amount → after-discount price** | a standing per-variant discount and the effective price it implies | interacts with the customer-group discount (§8.2) — settle the precedence, see §12.7 |
| **Product code** | a second identifier alongside SKU | |
| **Short description** | rich text | `Product` has **no description column at all** today |
| **Sort index** | display order, on the product and per variant | drives POS tile order |
| **Barcode** | **mandatory per variant** for them; optional for us | see the EAN-13 decision, §12.7 |
| **Product image** | **required** for them, with a real upload | ours is an optional pasted URL — no upload path exists |

Deferred, and correctly so: **VAT/SD group** (rides with the VAT decision) and **Cross products**
(cross-sell — Phase 2).

### 12.4 Missing master — Product groups

A grouping dimension beside category, used to filter the product list and several reports.

### 12.5 The lifecycle around the form

Our product list is a bare table. Theirs carries the whole working life of a product:

- **Search** by name / SKU / barcode, and **filter** by brand, category, product group, and status.
- **Disable / enable** — `Product.isActive` exists in our schema with **no UI to set it**. A product
  you no longer stock should stop appearing at the POS without being deleted (deleting is blocked
  once it has history anyway, so today there is no way to retire a product at all).
- **Duplicate** — the fastest way to add the next near-identical product.
- **Import** products in bulk, and **export** the list (their PDF / Excel / CSV / Print).
  Import is what makes loading a real opening catalogue survivable.
- **Barcode / label printing** — a per-product action *and* a dedicated print sheet.

### 12.6 What we deliberately still do better

Their category master is three separate pages (`/category`, `/sub-category`, `/child-category`); our
one Add-branch dialog with parent-scoped autocomplete creates the whole path at once. Keep it. The
same instinct applies here: their attribute/colour masters are three more pages — ours should be one
screen with the axes on it.

### 12.7 Decisions *(settled 2026-07-11)*

- [x] **Barcodes: auto-generate EAN-13, editable.** Every variant gets a scannable, check-digit-valid
      EAN-13 on save, from the **in-store range (prefix `20`)** which is reserved by GS1 for exactly
      this — internal codes that never collide with a manufacturer's. Overridable, so a product that
      arrives with a real barcode keeps it. This is what lets barcode be mandatory-by-default without
      anyone typing thirteen digits.
- [x] **Discount precedence: the best *single* discount wins — they never stack.** A line takes
      whichever is larger, the variant's own standing discount or the customer group's rate, and only
      that one. A manual bill discount typed by the cashier **replaces** the automatic one. Stacking
      three discounts is how a shop gives itself away without noticing.
- [x] **Minimum sale price: a hard block, for everyone.** Checkout refuses and names the item. A floor
      that can be waived is not a floor. Enforced on the server, not just the UI — same as the
      overselling and walk-in-credit rules.
- [x] **Wholesale: wired up.** `wholesalePrice` gains a `wholesaleQty` threshold — sell that many or
      more of a line and the price switches automatically. (The alternative was deleting the column;
      leaving it dead was not an option.)
- [ ] **Image upload** — where files live (local disk under `/public`, or object storage). Still open;
      an image stays **optional** for us (it is required for them, which is an e-commerce concern we
      don't have).
- [ ] **Per-language product names** (their English / Bengali tabs) — ties to the standing i18n
      decision in §6.

### 12.7a How a line is priced — one rule, one place

Because three discounts can now touch one line, the order is fixed and lives in **one** function
(`src/lib/pricing.ts`), so it cannot drift between the POS screen and the server:

```
unit price   = wholesaleQty reached ? wholesalePrice : sellingPrice
auto discount= max(variant's own discount, customer group's rate)   ← the BEST one, never both
effective    = unit price − auto discount
                                        …then the server REFUSES if effective < minSalePrice
```

The cashier's manual bill discount is applied **after** that, at the bill level, and replaces the
automatic one rather than adding to it.

**The effective price is what goes onto the sale line** (`SaleItem.price`), with the catalogue price
kept alongside it in `SaleItem.listPrice` so a receipt can show what was saved. This matters: it
means `Sale.subtotal` is already net of every per-line discount, and `Sale.discount` holds only the
bill-level one — so the discount-apportioning rule for returns (§10.1a) and product profit (§11.6)
keeps working **exactly**, with no special cases.

### 12.8 Suggested build order

1. **Attributes + Colors + Generate variants** (§12.2) — the one that decides whether the app is
   usable for a real clothing shop.
2. **Alert quantity, minimum sale price, wholesale qty** (§12.3) — small fields, real rules, and one
   of them is already dead code in our schema.
3. **List: search, filters, disable/enable, duplicate** (§12.5) — daily ergonomics.
4. **Barcode / label printing** — and settle EAN-13 with it.
5. **Import / export** — needed the first time a real catalogue is loaded.
6. Product groups, description, sort index, image upload.

### 12.9 The import file *(built 2026-07-11)*

One row per **variant**; the **SKU is the key** (a known SKU updates, a new one creates). Rows that
share a `name` join the same product, so "one more size of the shirt we already sell" lands where you
would expect.

| | columns |
|---|---|
| **Required** | `sku`, `name`, `price` |
| **Optional** | `code`, `category`, `brand`, `unit`, `variant`, `axis`, `size`, `color`, `barcode`, `cost`, `discount_type`, `discount_value`, `wholesale_price`, `wholesale_qty`, `min_sale_price`, `alert_qty`, `active` |

- `size` is a value on an **axis**; `axis` names which one, defaulting to **Size**. Carrying the axis
  in the file is what makes an export re-import losslessly — otherwise `M` the *Size* and `M` the
  *Fit* are indistinguishable on the way back in. Sizes and colours the file names but the shop does
  not have yet are **created**, so a whole clothing catalogue loads in one pass. The product also
  collects the axes its variants use, so an imported catalogue can be extended with the variant
  generator afterwards rather than only in a spreadsheet.
- A missing `barcode` is **generated** (EAN-13, §12.7).
- **Preview before write.** The importer names every row it will create, update or skip — and every
  category, brand, unit, size and colour it would have to create — before anything is written. A row
  with no SKU, no name, an unparseable price, or a SKU repeated inside the file is **skipped**, never
  guessed at.
- **Stock is exported (`stock_readonly`) but never imported.** Stock moves only through purchases,
  sales and returns, each of which carries a cost and an audit trail. Letting a spreadsheet set it
  would put goods on the shelf that nothing ever paid for, and the weighted-average cost — and so
  every profit figure — would be a fiction.

### 12.10 The POS grid shows products, not variants *(built 2026-07-11)*

A tile per **variant** does not survive a real catalogue: six sizes in four colours is twenty-four
tiles before the shop has a second product, and the cashier reads the same product name twenty-four
times to find one of them. So the grid shows **one tile per product** — name, price (a range when the
variants differ), total stock across variants, and how many options there are.

- **Simple product** → tapping it adds it, as before. There is no choice to make.
- **Variable product** → tapping it opens a **picker**. When every variant sits on both axes, the
  picker is a **size × colour matrix** with the price and stock in each cell, because that is the
  shape of the shelf the cashier is picturing. One axis, or hand-typed labels, falls back to a plain
  list — still one tap. Out-of-stock cells are **shown and disabled**, never hidden: *"we don't have
  that size"* is an answer the cashier has to be able to give.
- **A scan never opens the picker.** A barcode or an exact SKU names one variant outright, so it goes
  straight into the cart. The fast path must not get slower in order to make the browse path better.
- Searching a SKU or barcode *fragment* pulls up the whole **product**, so the sizes are still there
  to choose between; only an *exact* match short-circuits.

---

## 13. POS, round 2 — what the reference app has that we don't

Studied read-only on 2026-07-11 (screen DOM + its client config and cart script; nothing was clicked,
typed, created or deleted). Our POS already matches theirs on the core loop — product grid with stock,
name/SKU/barcode search, walk-in "Guest" customer, quick-add customer, hold/park, split payment across
accounts, change due, due date for credit, and an 80mm receipt. What follows is the delta.

### 13.1 The cart line is editable at the counter — and password-gated

Their cart row has columns we don't have at all: **unit price (editable)**, **discount rate (%)**,
**discount amount**, **after-discount price**. So a cashier can haggle a line down without touching
the catalogue. It is governed by three settings:

- `PRICE_CHANGE` — may this user retype a line's price at all?
- `PRODUCT_WISE_DISCOUNT` — is a per-line discount box shown?
- `REMARK_REQUIRED_WITH_DISCOUNT` — must a reason be typed when a discount is given?
- `ASK_PASSWORD` — a **manager password prompt** (`/check-password`) before an override is accepted.

This is the biggest functional gap. Our discounts are all decided *before* the sale (variant discount,
group discount) or applied to the whole bill; a shop that bargains per item cannot do it on our screen.
**Our minimum sale price becomes the guardrail that makes this safe** — an override may cut a line, but
never below the floor.

### 13.2 A wholesale cart mode

`CART_TYPE` is `Regular` **or** `Wholesale`, and switching to wholesale asks for a
`wholesale_password`. It re-prices the *whole cart* at wholesale rates. Ours only switches a line when
its qty crosses that variant's `wholesaleQty` threshold — good for "buy 5, get the bulk rate", useless
for "this customer is a reseller, price the whole basket wholesale". Customers also carry a
`sale_type` of `retail`/`wholesale`, so the mode can follow the customer.

### 13.3 Payment details we don't collect

- **Delivery charge** — a line on the bill, added to the payable.
- **Cheque fields** — bank name, cheque number, issue date, activation date, issuer name. We offer
  CHEQUE as a payment method but store none of this, so a bounced cheque can't be chased.
- **Sale date** — the sale can be **back-dated**. Ours is always "now".
- **Remark** — a free-text note on the sale.
- **Installments** — tenor in months, interest rate, monthly instalment. (Almost certainly not wanted
  for a single clothing store; listed for completeness.)
- **Loyalty points** — points earned on this sale and the customer's previous balance, redeemable.
  Already deferred to Phase 2.

### 13.4 Shop-wide POS settings

`NEGETIVE_SALE` (may a cashier sell stock we don't have?), `SHOW_STOCK_IN_POS`, `VAT_RATE` +
`INCLUDING_VAT` (VAT inclusive or on top), `CARTON_CHECK` (sell by carton with a multiplier — a
wholesale/grocery idea, not a clothing one), `PRINT_SETTING` (80mm vs A4), `INVOICE_POPUP` and silent
print, and invoice options for showing size/colour and the barcode on the receipt. They also have
separate **chalan** and **packaging** invoice formats. We have none of these — we have no `/settings`
page at all, which is where they belong.

### 13.5 Grid filters

Their grid filters by **brand / category / sub-category**. Ours has search only. With a real catalogue
loaded, tapping through to a product without a filter gets slow.

### 13.6 What we deliberately do better — keep it

- **Pricing is decided on the server** (the client sends only variantId + qty). Theirs posts prices
  from the browser.
- **A minimum sale price the checkout enforces.** Nothing in their POS stops a line going to zero.
- **The best *single* discount wins.** Their customer-group discount is dropped into the *bill*
  discount box, which stacks with a per-line discount — exactly the accident §12.7a exists to prevent.
- **The size × colour picker** (§12.10) beats a flat variant list.

### 13.7 Barcode scanning without a scanner *(decided 2026-07-11)*

The search box already accepts a hardware scanner, because a scanner is just a keyboard that types
fast. Until one is bought, a phone paired as a **Bluetooth keyboard** (a scanner-keyboard app) types
into the same box and needs no code from us.

**Deferred: an in-POS camera scanner.** Reading a barcode from the phone's camera needs
`getUserMedia`, which browsers only grant on **HTTPS** — and we have no HTTPS yet. When we deploy,
build it: `BarcodeDetector` on Android Chrome, a ZXing fallback for iOS Safari. Not before.

---

## 14. Exchange *(studied read-only 2026-07-11 — reference app; nothing clicked, created or deleted)*

### 14.1 Why this one, and not the line override

The reference app has both. Its **line price/discount override** is switched **off** in the live shop
(`PRODUCT_WISE_DISCOUNT=0`, `ASK_PASSWORD=0`) and **not one** of the shop's invoices carries a
discount — every line is a clean tag price. **Exchange is the opposite: it is used.** 21+ approved
exchanges run from Nov 2024 to Sep 2025, a steady trickle. For a children's clothing shop this is the
defining counter request — the size is wrong, the customer comes back, they swap it. We support none
of it. Build what the shop does, not what the software offers.

### 14.2 How theirs works

The POS has an **Exchange** panel beside the cart. It takes the **original invoice number** (or a
scan of the item being handed back), lists that invoice's lines, and the cashier picks the quantities
coming back. Their panel lets the returned line's **price be retyped**. Pressing Continue turns the
returned goods into an **`exchange_amount`** — a credit carried into the payment modal, which offsets
the payable of the new cart. The result is recorded as **From Invoice → To Invoice**: an exchange
produces a *brand-new sale*, linked back to the one it came from.

So an exchange is not a new kind of document. **It is a sale return and a sale, settled as one
transaction.** We already have both halves.

### 14.3 What we build

The POS gets an **Exchange** panel. Enter the original invoice number; its lines appear with the
quantity still returnable (sold − already returned). Take goods back, put new goods in the cart, and
the difference is what changes hands.

**The money, in one place:**

| | |
|---|---|
| `C` — exchange credit | the returned goods, valued at **what the customer actually paid** (§10.1a: the bill's discount apportioned via `paidRatio`) |
| `T` — new cart total | priced by the one pricing rule (§12.7a), as any sale |
| **Payable** | `T − C`. Positive: the customer pays the difference. Negative: we owe them `C − T`. |

**Deliberate differences from theirs:**

- **The credit is not typeable.** Theirs lets the cashier retype the returned line's price; ours values
  it at what the sale's ledger says was paid for it. A credit you can type is a hole in the till, and
  it would also desynchronise the return from the sale it reverses.
- **An invoice is required.** Theirs can also credit a bare barcode scan with no invoice behind it —
  goods we have no proof were ever bought here. Ours will not credit what it cannot trace.

**In the ledger, one transaction:**
1. A **SaleReturn** against the original sale — stock back on the shelf at `costAtSale`, `returnedQty`
   incremented, `total = C`, `refunded = 0`. It does **not** touch the customer's balance: the credit
   is not owed to them, it is about to be spent.
2. A **new Sale** for the cart, total `T`, exactly as a normal checkout.
3. A payment line on the new sale of `method = "EXCHANGE"`, amount `min(C, T)`, with **no account** —
   because no cash moved. Real tender covers the rest.
4. If `C > T`, the excess `C − T` goes back: cash out of an account for a walk-in, or a credit to a
   named customer's ledger.
5. An **Exchange** record linking the two — `fromSale → saleReturn → toSale` — which is the
   *From Invoice / To Invoice* list theirs shows.

Because the return nets both revenue and COGS out, and the new sale adds its own, **profit stays
honest without a single special case in the reports.**

### 14.4 Settled

- **No time limit** on how old the original invoice may be — theirs has none, and the shop swaps
  against month-old invoices. If a limit is ever wanted it belongs in `/settings`, not in the code.
- **A walk-in can exchange.** The existing "a walk-in must be refunded in full" rule exists because a
  credit balance owed to nobody is a bug — but here the credit is spent immediately, so the rule is
  relaxed for exchange and only re-applies to the `C > T` remainder, which is refunded in cash.

---

## 15. Loyalty points *(studied read-only 2026-07-13; decisions settled)*

The reference shop runs points live — invoices show *Earned / Redeemed / Available*, and customers
hold real balances. We have none of it.

**Settled: balances start at zero.** MPoS is a new system, not a migration of the old one, so no
historic point balance is carried across. That removes the only hard part of this module — there is
no import, no reconciliation, and no cut-over date to agree.

### 15.1 The earn rule is a repeating threshold, not a rate — and the data proved it

This is the finding that mattered, and it killed a plausible-sounding answer for the second time in
this project. Their Point System page holds **one configuration row** plus a conversion rate:

| Setting | Their value |
|---|---|
| Minimum amount | **100** |
| Reward points | **10** |
| Is repetitive | **yes** |
| Conversion rate | **1 point = 0.10** |

So points earned are **`floor(bill ÷ 100) × 10`** — a *repeating threshold*, not points-per-taka.
Checked against three real invoices, all three match exactly and **none** matches a linear rate:

| Bill | Points earned | `floor(bill/100) × 10` | A "1 pt per 10" rate would give |
|---|---|---|---|
| 640 | **60** | 60 ✅ | 64 ❌ |
| 740 | **70** | 70 ✅ | 74 ❌ |
| 660 | **60** | 60 ✅ | 66 ❌ |

**The effective return is 1%**: 10 points per 100 spent, each worth 0.10 → 1.00 back per 100.
The rate we had guessed at (1 point per 10 taka, 1 point = 1 taka) would have been a **10% giveaway —
ten times the intended reward, on every sale.** Build what the shop does, not what sounds reasonable.

### 15.2 Everything is configurable — that is the requirement

The user's instruction: the earn rule and the point value must be **editable in the app**, not
constants in the source. So loyalty forces **Settings** (§17) to exist — there is nowhere to put a
configurable value today. The shipped **defaults are the shop's real rule** above, so the scheme
behaves on day one exactly as their customers already expect.

Settings: `loyaltyEnabled`, `earnAmount` (100), `earnPoints` (10), `earnRepeating` (true),
`pointValue` (0.10), `minRedeemPoints` (100), `maxRedeemPct` (50).

### 15.3 Earning

- Points are earned on **what the customer actually paid** — the bill total, *after* every discount.
  It follows that a **free issue (§16) earns nothing**, because it adds nothing to the total. No
  special case needed.
- Points are earned by a **named customer only**. The walk-in customer cannot hold a balance, for the
  same reason it cannot hold a due (§9): a balance owed to nobody is not a balance.
- Points are whole numbers. `floor`, never round — the shop should never owe a fraction of a point.

### 15.4 Redemption is a payment made in points

A redemption is **not a discount on the line**. It is a payment, exactly like the exchange credit
(§14): a `Payment` row with `method = "POINTS"` and **no `accountId`**, because no cash crossed the
counter. This is deliberate and it is the whole reason the design stays simple:

- Line pricing, the discount rule and the **minimum sale price floor are untouched** — the goods sold
  for what they sold for; the customer merely settled part of the bill with something other than cash.
- The sale's `total` is unchanged, so the profit on the *goods* is still the truth about the goods.

Two limits, both configurable, both settled with the user:
- **A minimum balance to redeem** (default 100 points = 10.00) — stops fiddly one-point redemptions.
- **A cap on the share of a bill points may cover** (default 50%) — every sale still takes real money.

Both are enforced **on the server**. A cap the browser could talk around is not a cap — the same rule
as the price floor (§12.7a) and the free issue (§16.2).

### 15.5 Points reverse with the goods

The hole: buy → earn points → return the goods → keep the points is **free money, repeatable
indefinitely**. So earned points are clawed back **in proportion to what was actually credited** —
the same `paidRatio` rule that returns (§10.1a) and exchanges (§14) already use. Settled with the
user, in full knowledge that it can drive a balance **negative** if the customer has already spent
the points: that is correct, and the alternative ("never below zero") just moves the hole to *spend
the points first, then return the goods*.

Points redeemed **on** a returned sale come back to the customer's balance — they paid with them and
the goods went back, so the points are theirs again.

### 15.6 A points ledger, not just a balance

`Contact.pointsBalance` is a cache. The truth is a **`PointEntry` ledger** — one row per movement
(`EARN`, `REDEEM`, `REVERSE`), each pointing at the sale or return that caused it. Without it,
"why do I have 340 points?" is unanswerable, and a wrong balance can never be reconstructed. Every
other balance in this system (stock, cash, dues) is backed by its movements; points are no different.

### 15.7 Open — the accounting of a redemption

A redemption pays a bill with something that is not money, so revenue is booked in full while the
cash drawer is short by the redeemed value. That is **internally consistent** (it is exactly how the
exchange credit already behaves), but it means the loyalty scheme's cost is not yet visible anywhere
in the P&L. The honest place for it is an **expense**, once the Expenses module exists (Phase 2) —
the P&L screen already has the slot. Flagged rather than fudged.

---

## 16. Free issue & sale remark *(defect — the price floor made a real flow impossible)*

Adding the **minimum sale price** (§12.7) closed a hole and opened another: with a floor above zero,
**a line can no longer be sold at 0.00**. But the shop does exactly that — an invoice in their live
account carries the remark **"Qc Out"** on a zero-value sale: goods leaving the counter for nothing,
a QC write-off or a free issue. As it stands MPoS would *refuse* that sale outright, and the
shopkeeper's only workaround is not to record it at all — which means the stock never leaves the
books and the loss is never seen.

This is a defect, not a feature. It is fixed before loyalty points.

### 16.1 A free line is declared, not priced

The naive fix — "let the price go to zero" — hands every cashier a way around the floor. The floor
exists precisely to stop goods walking out cheap; a cashier who can type `0.00` has no floor at all.

So a free issue is **its own explicit act**, not a price:

- A cart line is either **priced** (the §12.7a rule applies, floor and all) or **free** (`price = 0`).
- Marking a line free is a **toggle**, not a number the cashier types. There is no path from a
  discount box to zero — the floor still binds every priced line, without exception.
- `listPrice` still records what the catalogue says, so the receipt and the reports can show what was
  given away rather than pretending the goods were worthless.

### 16.2 Only an Admin may give goods away

Gated on a new **`sales.free_issue`** permission — Admin only, the same way profit is (§11.2). A
cashier's POS does not show the control, **and the server refuses a free line from a role without the
permission.** A gate the browser enforces is not a gate.

### 16.3 A free line must say why

A zero-value sale with no reason is indistinguishable from a mistake. The sale's **remark** is
therefore **mandatory whenever any line is free** — enforced on the server. (`Sale.note` already
exists on the model and was never surfaced; it becomes the remark. No new column.)

### 16.4 What a free line does downstream — all of it falls out for free

- **Stock** moves exactly as a sale: the goods leave. That is the entire point.
- **Profit** — the line has a real `costAtSale` and zero revenue, so it lands in the P&L as a
  **loss of exactly what the goods cost**. Correct: a write-off *is* a loss, and it should be visible.
- **A return of a free line credits 0.00.** It already does — returns are priced at what the customer
  actually paid (§10.1a), and they paid nothing. No special case.
- **The bill discount** never applies to a free line (0 × anything is 0), and the floor check must
  **skip** free lines — or a floor of 9.00 would refuse the very sale we just made possible.

### 16.5 What we are not doing

Not a per-line price override, and not a per-line discount box (§13.1 — the shop's own data killed
that: `PRODUCT_WISE_DISCOUNT=0`, and not one of their invoices carries a line discount). A line is
sold at the catalogue rule, or it is given away. There is no third thing.

---

## 17. Settings *(forced into existence by loyalty — §15.2)*

`/settings` has been in the sidebar since the app shell was built and has always been a **404**.
Loyalty is what finally requires it: the user's instruction is that the earn rule and the point value
must be **editable in the app**, and there is nowhere to put a configurable value today.

### 17.1 One row, not a key–value bag

A `Setting(key, value)` table is tempting and wrong: every read becomes a string parse, every typo is
a silent `undefined`, and nothing is type-checked. Settings here are a **single row** on a
`ShopSetting` table with real, typed columns and real defaults — so a missing value is impossible and
the compiler knows what exists.

`getSettings()` returns that row, creating it from the defaults on first call. There is exactly one.

### 17.2 What moves in

- **Loyalty** (§15.2) — enabled, earn amount, earn points, repeating, point value, minimum redeem,
  max redeem % of a bill.
- **Default alert quantity** — the per-product low-stock threshold **is hardcoded to 5** in the
  inventory low-stock filter. It becomes the shop-wide default that a product's own `alertQty`
  overrides.

Anything else (VAT, negative sale, POS toggles — §13.4) stays out until something actually needs it.
A settings page that fills up with switches nobody has asked for is how software rots.

### 17.3 Admin-only

Settings change money rules — an earn rate is a lever on every future sale. Gated on
**`settings.manage`**, Admin-only, on the **page and the server action** both.

---

## 18. Expenses & accounts *(studied read-only 2026-07-13 — reference app; nothing created, edited or deleted)*

The biggest hole in our P&L. We report **gross** profit — what the goods earned over what they
cost — and stop. Rent, electricity and wages never post against it, so the screen cannot answer the
only question the shopkeeper actually has: *did I make money this month?*

### 18.1 What the shop really spends *(from their live data, not their feature list)*

55 expenses, **720,797.00** all-time. Six expense types, and the pattern is unmistakable:

| Type | Cadence | Typical |
|---|---|---|
| Space Rent | every month | 25,000.00 |
| Eid Bonus & Staff | every month | 12,000.00 |
| Internet Bill | every month | 1,050.00 |
| Electricity | most months | ~6,364.00 |
| Others | every month | varies (6,300 – 14,275) |
| Boost | occasional | (social-media ads) |

Every single one is **paid in Cash** and **dated the last day of the month**. Nobody itemises a rent
payment on the day it happened; they close the month and book it. Whatever we build must make that
one-minute month-end routine effortless — it is 100% of the real usage.

### 18.2 Their expense record is tiny — and that is the finding

The whole Add/Update Expense form is **five fields**: `Date`, `Expense Type`, `Payment Type`
(Cash / Mobile Banking / Card / Bank Account / Bank Cheque), `Amount`, `Note`. That is all.

No attachment, no recurring rule, no approval, no supplier link, no expense number, and **no
account picker** — `Payment Type` is a bare label, not a reference to an account. They get away
with it because the shop has exactly **one account** (Cash, 1,560,982.00).

**We will not copy that.** MPoS already has real `Account` rows (Cash + Bank) and a `Payment` table
that every other module posts through. An expense will pick a **real account**, exactly like a
purchase payment does — so the money leaves something specific, and the account's balance and ledger
stay true. A payment method that isn't tied to an account is a hole in the books waiting to open.

**Expense Type master** is likewise just a name (their table: name + branch, nothing else).

### 18.3 An expense moves cash — verified in their ledger

Checked directly, and it corrected a wrong first reading (the account ledger's first page was
paginated at 25 rows, so the expenses were simply off-screen — the second look proved they are there):

On **2025-12-31**, four expenses (25,000 + 1,050 + 9,730 + 12,000 = **47,780**) appear in the **Cash
account ledger as credits**, dropping the running balance line by line, and the same **47,780** shows
on the Cash Flow screen's `Expense` cash-out line. So an expense is a real cash movement, not a memo.

For us this is one `Payment` row (`direction = OUT`, an `accountId`, **no contact**) — the same
instrument the purchase payment already uses. Nothing new is invented.

### 18.4 Salary is a separate line, not an expense type

Their Cash Flow and P&L both carry **`Salary`** on its own, beside `Expense` (December: Expense
47,780, Salary 31,000). Salary comes from their Employees module, which we do not have.

Until we build Employees, **salary is just an expense type** in MPoS. It posts to the same place and
lands in the same P&L block. Splitting it into its own subsystem before there are employees to attach
it to would be building a feature to make a report look like theirs.

### 18.5 Their P&L, and where ours gains its missing block

Their December figures, and the arithmetic checks out exactly:

```
Gross Profit (product sales profit)      365,837.00
  − Business Expenses                    − 47,780.00
  − Salary Expenses                      − 31,000.00
  = Net Profit                           287,057.00     ✓ 365,837 − 47,780 − 31,000
```

Our P&L already computes gross profit correctly and already has the slot. It gains one block:

```
Operating expenses
  <by type — Space Rent, Electricity, …>
  Total expenses
Net profit  =  Gross profit − Total expenses
```

Net profit is the number that was missing. It is the point of the whole module.

### 18.6 What we build

- **Expense types** — a small master (name, active), like Brands/Units. Seeded with nothing; the
  shop names its own.
- **Expenses** — list (date range, type filter, running total) + a create/edit dialog:
  **date, type, account, amount, note**. Type, account, amount and date are mandatory; note is not.
- **It posts.** Saving writes a `Payment` (`OUT`, against the chosen account) and **decrements that
  account's balance**. Editing reverses and re-posts; deleting reverses. The same discipline as
  every other document we have — an expense that doesn't move the drawer is a lie on the P&L.
- **P&L gains its Operating-expenses block and a Net profit line**, broken down by type.
- **Admin-only.** Expenses are the shop's private cost base — a cashier has no business seeing the
  rent, let alone editing it. New permission **`expenses.manage`**; profit is already Admin-only
  (`reports.profit`), and net profit must not become the back door into it.

### 18.7 What we are NOT building — no trace of it in their data

- **Expense against a sale invoice.** Their expense report has `Invoice No` / `Sale Date` columns and
  a "Sale Date Wise" grouping — and in the shop's real records **every one of them is blank**. Skip it
  (the same test that killed the line-discount override in §13).
- **Recurring expenses.** Tempting — rent *is* monthly — but they retype it each month in seconds, and
  a recurring rule that silently posts money is a liability nobody asked for. Build only on request.
- Attachments, approval flows, expense numbers, per-payment-method labels.

### 18.8 Decisions — **settled with the user 2026-07-13**

1. **A points redemption posts as an expense — §15.7 is now closed.** When a customer pays 14.00 of a
   bill in points, revenue books the full bill while the drawer is 14.00 short; the scheme's cost was
   **invisible in the P&L**. The redeemed value now posts automatically as a **"Loyalty points"**
   expense, so what the scheme costs over a year is a line the shopkeeper can see and judge.
   **It carries no account** — no cash crossed the counter, exactly like the `POINTS` payment itself
   (§15.4) and the `EXCHANGE` credit (§14) — so no balance moves. It makes the cost *visible*, it does
   not make it *paid*. It reverses with the goods when the sale is returned.
2. **Salary is an expense type, not a subsystem.** Theirs is split out because an Employees module
   feeds it; we have none. It posts to the same place and lands in the same P&L block. It earns its own
   subsystem when there are employees to attach it to.
3. **Admin-only** — new **`expenses.manage`** permission. Rent and wages are not a cashier's business,
   and net profit must not become a back door into the Admin-only profit figures (§11.2).
4. **An expense may be back-dated.** Their entire workflow depends on it — everything is booked at
   month-end, December's rent entered as 31-Dec. So the P&L keys off the expense **date**, never its
   creation time.
