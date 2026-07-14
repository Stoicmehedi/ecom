"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { requirePermission } from "@/lib/guard";
import { getSettings } from "@/lib/settings";
import {
  pointsEarned,
  pointsForValue,
  pointsValue,
  redeemLimit,
} from "@/lib/loyalty";
import { docStatus, resolveDiscount, round2, round3 } from "@/lib/costing";
import { priceLine } from "@/lib/pricing";
import { checkQtyLines } from "@/lib/qty";
import { postLoyaltyExpense } from "@/lib/expenses";
import {
  creditFor,
  pointsMovementFor,
  validateReturnLines,
  writeSaleReturn,
} from "@/lib/sale-return";
import type { Prisma } from "@/generated/prisma/client";

export type CheckoutResult = { ok?: boolean; error?: string; saleId?: number };

// The client sends WHAT and HOW MANY. It does not send the price — the server
// prices every line itself (BLUEPRINT §12.7a), because a price floor that the
// browser could talk its way around would not be a floor.
const lineSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().positive("Quantity must be greater than zero"),
  /** A free issue / QC write-off (BLUEPRINT §16) — Admin-only, and needs a remark. */
  free: z.boolean().optional(),
});

const paymentSchema = z.object({
  method: z.string().trim().min(1),
  accountId: z.number().int().nullable().optional(),
  amount: z.number().min(0),
});

/** Goods coming back over the counter as part of this sale (BLUEPRINT §14). */
const exchangeSchema = z.object({
  saleId: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        saleItemId: z.number().int().positive(),
        qty: z.number().min(0),
      }),
    )
    .min(1),
  /** Where the excess goes when the returned goods are worth more than the new ones. */
  refundMethod: z.string().trim().optional(),
  refundAccountId: z.number().int().nullable().optional(),
});

const checkoutSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  discountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
  discountValue: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  note: z.string().trim().max(500).optional(),
  items: z.array(lineSchema).min(1, "The cart is empty"),
  payments: z.array(paymentSchema).default([]),
  exchange: exchangeSchema.optional(),
  /** Points the customer wants to spend on this bill (BLUEPRINT §15.4). */
  redeemPoints: z.number().int().min(0).default(0),
  /** Cash handed over, so a reprint can still show it and the change (§20.3). */
  tendered: z.number().min(0).optional(),
});

export type CheckoutInput = z.input<typeof checkoutSchema>;

type Tx = Prisma.TransactionClient;

async function nextInvoiceNo(tx: Tx): Promise<string> {
  const last = await tx.sale.findFirst({
    orderBy: { id: "desc" },
    select: { invoiceNo: true },
  });
  const n = last ? parseInt(last.invoiceNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `INV-${String(n + 1).padStart(5, "0")}`;
}

async function nextExchangeNo(tx: Tx): Promise<string> {
  const last = await tx.exchange.findFirst({
    orderBy: { id: "desc" },
    select: { exchangeNo: true },
  });
  const n = last ? parseInt(last.exchangeNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `EXC-${String(n + 1).padStart(5, "0")}`;
}

/** The original invoice, shaped for the shared return core. */
function loadExchangeSale(saleId: number) {
  return prisma.sale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          // The unit rides along so `validateReturnLines` refuses half a shirt
          // coming back on an exchange, exactly as the return screen does (§21).
          variant: {
            select: {
              sku: true,
              product: { select: { unit: { select: { name: true, allowDecimal: true } } } },
            },
          },
        },
      },
    },
  });
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  // Selling itself is a permission (§25.2). Without this, a role with no `sales.create`
  // could still ring up a sale by reaching the action directly — the free-issue gate
  // below guarded the *exception* while the rule itself stood open.
  const denied = await requirePermission("sales.create");
  if (denied) return { error: denied };

  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;

  // The same variant scanned twice is one line — and it must be, or the wholesale
  // threshold could be dodged by scanning 5 × 1 instead of 1 × 5. Free and priced
  // lines of the same variant stay APART, though: giving one shirt away and selling
  // another is two different things, and merging them would price the gift.
  const merged = new Map<string, { variantId: number; qty: number; free: boolean }>();
  for (const it of s.items) {
    const free = it.free === true;
    const key = `${it.variantId}:${free}`;
    const prev = merged.get(key);
    if (prev) prev.qty = round3(prev.qty + it.qty);
    else merged.set(key, { variantId: it.variantId, qty: it.qty, free });
  }
  const lines = [...merged.values()];

  // ---- Free issue (BLUEPRINT §16). The floor exists to stop goods walking out
  // cheap, so the one hole in it is gated and must state its reason.
  const session = await auth();
  const hasFree = lines.some((l) => l.free);

  if (hasFree && !hasPermission(session, "sales.free_issue")) {
    return { error: "You do not have permission to give goods away free." };
  }
  if (hasFree && !s.note?.trim()) {
    return { error: "A free issue needs a remark saying why (e.g. \"QC out\")." };
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((i) => i.variantId) } },
    include: {
      product: {
        select: {
          name: true,
          minSalePrice: true,
          isActive: true,
          unit: { select: { name: true, allowDecimal: true } },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  // The cart's qty box is `step="1"`, but a cart is only a suggestion until the
  // server agrees with it (§21.2, §12.7a).
  const badQty = checkQtyLines(
    lines.map((l) => {
      const v = byId.get(l.variantId);
      return {
        qty: l.qty,
        unit: v?.product.unit ?? null,
        label: v ? (v.label ? `${v.product.name} — ${v.label}` : v.product.name) : `#${l.variantId}`,
      };
    }),
  );
  if (badQty) return { error: badQty };

  // The customer's group rate is one of the two candidate discounts per line.
  const customer = s.customerId
    ? await prisma.contact.findUnique({
        where: { id: s.customerId },
        select: {
          isWalkIn: true,
          loyaltyPoints: true,
          customerGroup: { select: { discount: true } },
        },
      })
    : null;
  if (s.customerId && !customer) return { error: "That customer no longer exists." };

  const settings = await getSettings();

  const groupPct = Number(customer?.customerGroup?.discount ?? 0);

  // A manual bill discount REPLACES the automatic one rather than adding to it —
  // stacking every discount is how a shop gives itself away (BLUEPRINT §12.7a).
  const manual = round2(s.discountValue) > 0;

  const nameOf = (v: (typeof variants)[number]) =>
    v.label ? `${v.product.name} — ${v.label}` : v.product.name;

  // ---- Exchange: goods handed back offset what the new ones cost (BLUEPRINT §14).
  // Loaded before pricing, because the goods coming back are stock we can sell —
  // that is what lets a customer swap the last shirt on the rail for another size.
  const ex = s.exchange;
  let oldSale: Awaited<ReturnType<typeof loadExchangeSale>> = null;
  let credit = 0;
  let exLines: { saleItemId: number; qty: number }[] = [];
  const returning = new Map<number, number>();

  if (ex) {
    exLines = ex.lines.filter((l) => l.qty > 0);
    if (exLines.length === 0) {
      return { error: "Enter a quantity for the goods being handed back." };
    }
    oldSale = await loadExchangeSale(ex.saleId);
    if (!oldSale) return { error: "The original invoice no longer exists." };

    const invalid = validateReturnLines(oldSale, exLines);
    if (invalid) return { error: invalid };

    // The goods' worth, less any points handed back with them — those return as
    // points, not as spendable credit (§15.5), or they would become money.
    const goods = creditFor(oldSale, exLines);
    const exPoints = pointsMovementFor(oldSale, goods, settings);
    credit = round2(goods - exPoints.restoredValue);

    const itemById = new Map(oldSale.items.map((i) => [i.id, i]));
    for (const l of exLines) {
      const it = itemById.get(l.saleItemId)!;
      returning.set(it.variantId, round3((returning.get(it.variantId) ?? 0) + l.qty));
    }
  }

  const items: {
    variantId: number;
    qty: number;
    listPrice: number;
    price: number;
    discount: number;
    subtotal: number;
    isFree: boolean;
  }[] = [];

  for (const it of lines) {
    const v = byId.get(it.variantId);
    if (!v) return { error: "A product in the cart no longer exists." };
    if (!v.product.isActive) {
      return { error: `"${nameOf(v)}" is no longer on sale.` };
    }

    // Overselling is blocked — stock can never go negative. Anything being handed
    // back in this same exchange is already on the shelf by the time we sell.
    const inStock = round3(Number(v.stockQty) + (returning.get(it.variantId) ?? 0));
    if (it.qty > inStock + 0.0005) {
      return {
        error: `Only ${inStock} of "${nameOf(v)}" in stock — you cannot sell ${it.qty}.`,
      };
    }

    const p = priceLine({
      sellingPrice: Number(v.sellingPrice),
      wholesalePrice: v.wholesalePrice == null ? null : Number(v.wholesalePrice),
      wholesaleQty: v.wholesaleQty == null ? null : Number(v.wholesaleQty),
      discountType: manual ? "AMOUNT" : v.discountType,
      discountValue: manual ? 0 : Number(v.discountValue),
      groupDiscountPct: manual ? 0 : groupPct,
      minSalePrice:
        v.product.minSalePrice == null ? null : Number(v.product.minSalePrice),
      isFree: it.free,
      qty: it.qty,
    });

    // The price floor is a rule, not a hint — refuse, and say which item.
    if (p.belowMin) {
      return {
        error: `"${nameOf(v)}" would sell at ${p.price.toFixed(2)}, below its ${p.minSalePrice?.toFixed(2)} minimum. Reduce the discount.`,
      };
    }

    items.push({
      variantId: it.variantId,
      qty: it.qty,
      listPrice: p.listPrice,
      price: p.price,
      discount: p.discount,
      subtotal: p.subtotal,
      isFree: p.isFree,
    });
  }

  // `subtotal` is already net of every per-line discount, so `discount` below
  // carries ONLY the bill-level one. That keeps the discount-apportioning rule
  // for returns (§10.1a) and product profit (§11.6) exact, with no special cases.
  const subtotal = round2(items.reduce((a, i) => a + i.subtotal, 0));
  const discount = resolveDiscount(subtotal, s.discountType, s.discountValue);
  const total = round2(subtotal - discount);

  // A bill discount must not sneak a line under its floor either. A free line is
  // already at zero by design — testing it against the floor would refuse the very
  // sale §16 exists to allow.
  if (discount > 0) {
    const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
    for (const it of items) {
      if (it.isFree) continue;
      const v = byId.get(it.variantId)!;
      const min = v.product.minSalePrice == null ? 0 : Number(v.product.minSalePrice);
      if (min > 0 && it.price * ratio < min - 0.005) {
        return {
          error: `That bill discount would push "${nameOf(v)}" below its ${min.toFixed(2)} minimum.`,
        };
      }
    }
  }

  // The credit is spent on this sale first; only what it cannot cover comes back
  // as money. It is never "paid" twice.
  const creditApplied = round2(Math.min(credit, total));
  const excess = round2(credit - creditApplied);

  const isWalkIn = !s.customerId || (customer?.isWalkIn ?? false);

  // ---- Points spent on this bill (BLUEPRINT §15.4). A redemption is a PAYMENT made
  // in points, not a discount: the goods sold for what they sold for, and the price
  // floor stays untouched. The limits are checked HERE, on the server — a cap the
  // browser could talk around is not a cap.
  const afterCredit = round2(total - creditApplied);
  let redeemPoints = 0;
  let redeemValue = 0;

  if (s.redeemPoints > 0) {
    if (isWalkIn) {
      return { error: "A walk-in holds no points — pick a named customer." };
    }
    const balance = customer?.loyaltyPoints ?? 0;
    const limit = redeemLimit(balance, total, settings);
    if (limit.blocked) return { error: limit.blocked };
    if (s.redeemPoints > limit.maxPoints) {
      return {
        error: `At most ${limit.maxPoints} points (${limit.maxValue.toFixed(2)}) can go on this bill — points may cover ${settings.maxRedeemPct}% of it.`,
      };
    }
    // Never spend more points than there is bill left to pay: an exchange credit may
    // already have covered it, and points that buy nothing must not be burned.
    const needed = pointsForValue(afterCredit, settings);
    redeemPoints = Math.min(s.redeemPoints, needed);
    redeemValue = round2(Math.min(pointsValue(redeemPoints, settings), afterCredit));
  }

  const payments = s.payments.filter((p) => p.amount > 0);
  const tendered = round2(payments.reduce((a, p) => a + p.amount, 0));
  const owed = round2(afterCredit - redeemValue); // what the customer still has to find

  if (tendered > owed + 0.005) {
    return {
      error: credit > 0
        ? "Paid amount is more than what is left to pay after the exchange."
        : "Paid amount is more than the sale total.",
    };
  }

  const paid = round2(creditApplied + redeemValue + tendered);
  const due = round2(total - paid);

  // Points are earned on what the customer ACTUALLY PAID — the bill after every
  // discount. A free issue therefore earns nothing, with no special case (§15.3).
  const earned = isWalkIn ? 0 : pointsEarned(total, settings);

  // A credit sale must be attached to someone we can actually chase. The walk-in
  // customer has an id, so checking for a missing id is not enough — a due parked
  // on "Walk-in" is a receivable owed by nobody.
  if (due > 0 && isWalkIn) {
    return { error: "A walk-in must pay in full — pick a named customer to sell on credit." };
  }

  // Goods worth more than the replacement: the difference has to go somewhere.
  // A walk-in has no account to hold it, so it must leave the drawer.
  if (excess > 0 && isWalkIn && !ex?.refundAccountId) {
    return {
      error: `The goods handed back are worth ${excess.toFixed(2)} more than the new ones — a walk-in must be refunded that in cash.`,
    };
  }

  const soldById = session?.user?.id ? Number(session.user.id) : null;

  try {
    const saleId = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ select: { id: true } });

      // The goods come back FIRST — they are on the shelf before the new sale takes
      // anything off it, which is what lets a customer swap the last one in stock
      // for a different size of the same thing.
      const ret = oldSale
        ? await writeSaleReturn(tx, {
            sale: oldSale,
            lines: exLines,
            date: new Date(),
            note: `Exchange against ${oldSale.invoiceNo}`,
            refunded: excess, // the part that actually leaves as money
            settings,
          })
        : null;

      // The return put stock back; re-read it so the sale decrements the real figure
      // rather than the one we loaded before the goods came over the counter.
      if (ret) {
        const fresh = await tx.productVariant.findMany({
          where: { id: { in: items.map((i) => i.variantId) } },
          include: {
            product: {
              select: {
                name: true,
                minSalePrice: true,
                isActive: true,
                unit: { select: { name: true, allowDecimal: true } },
              },
            },
          },
        });
        for (const v of fresh) byId.set(v.id, v);

        for (const it of items) {
          const v = byId.get(it.variantId)!;
          if (it.qty > Number(v.stockQty) + 0.0005) {
            throw new Error(`oversold:${nameOf(v)}:${Number(v.stockQty)}`);
          }
        }
      }

      const sale = await tx.sale.create({
        data: {
          invoiceNo: await nextInvoiceNo(tx),
          customerId: s.customerId ?? null,
          branchId: branch?.id ?? null,
          soldById,
          dueDate: s.dueDate ? new Date(s.dueDate) : null,
          itemsCount: items.length,
          subtotal,
          discountType: s.discountType,
          discountValue: round2(s.discountValue),
          discount,
          vat: 0, // deferred — see BLUEPRINT §6
          total,
          paid,
          due,
          status: docStatus(total, paid),
          note: s.note?.trim() || null,
          pointsEarned: earned,
          pointsRedeemed: redeemPoints,
          // Recorded, not recomputed: the change given is a fact about what happened
          // at the counter, and a reprint must show the same figures as the original.
          tendered: s.tendered && s.tendered > 0 ? round2(s.tendered) : null,
        },
      });

      for (const it of items) {
        const v = byId.get(it.variantId)!;

        await tx.saleItem.create({
          data: {
            saleId: sale.id,
            variantId: it.variantId,
            qty: round3(it.qty),
            // `price` is what we actually charged; `listPrice` is what the catalogue
            // says, so the receipt can show what the customer saved.
            price: it.price,
            listPrice: it.listPrice,
            discount: it.discount,
            // Snapshot the cost NOW — the weighted average moves with later purchases,
            // and profit on this sale must be measured against what it cost today.
            costAtSale: round2(Number(v.purchasePrice)),
            subtotal: it.subtotal,
            // Free goods still carry their cost — that is exactly why the P&L shows
            // a write-off as a loss of what the goods cost us (BLUEPRINT §16.4).
            isFree: it.isFree,
          },
        });

        await tx.productVariant.update({
          where: { id: it.variantId },
          data: { stockQty: round3(Number(v.stockQty) - it.qty) },
        });

        await tx.stockMovement.create({
          data: {
            variantId: it.variantId,
            type: "SALE",
            qty: round3(-it.qty),
            refType: "sale",
            refId: sale.id,
          },
        });
      }

      for (const p of payments) {
        await tx.payment.create({
          data: {
            direction: "IN",
            amount: round2(p.amount),
            method: p.method,
            accountId: p.accountId ?? null,
            contactId: s.customerId ?? null,
            saleId: sale.id,
            note: "Sale payment",
          },
        });
        if (p.accountId) {
          await tx.account.update({
            where: { id: p.accountId },
            data: { balance: { increment: round2(p.amount) } },
          });
        }
      }

      // The exchange credit is a payment made in goods, not in money: it settles
      // part of the bill but no account gains a penny, so it carries no accountId.
      // Without this line the sale would look unpaid; with an account it would
      // invent cash that never crossed the counter.
      if (ret && creditApplied > 0) {
        await tx.payment.create({
          data: {
            direction: "IN",
            amount: creditApplied,
            method: "EXCHANGE",
            accountId: null,
            contactId: s.customerId ?? null,
            saleId: sale.id,
            note: `Goods returned on ${oldSale!.invoiceNo} (${ret.returnNo})`,
          },
        });
      }

      // Points spent settle part of the bill, but no account gains a penny — the same
      // shape as the exchange credit above, and for the same reason: nothing crossed
      // the counter. With an accountId this would invent cash (BLUEPRINT §15.4).
      if (redeemPoints > 0 && s.customerId) {
        await tx.payment.create({
          data: {
            direction: "IN",
            amount: redeemValue,
            method: "POINTS",
            accountId: null,
            contactId: s.customerId,
            saleId: sale.id,
            note: `${redeemPoints} points redeemed`,
          },
        });
        await tx.pointEntry.create({
          data: {
            contactId: s.customerId,
            saleId: sale.id,
            points: -redeemPoints,
            type: "REDEEM",
            note: `Spent on ${sale.invoiceNo}`,
          },
        });

        // What the scheme cost the shop, booked where profit is judged (§18.8).
        // Carries no account: the bill was settled, but no money was paid out.
        await postLoyaltyExpense(tx, {
          saleId: sale.id,
          invoiceNo: sale.invoiceNo,
          points: redeemPoints,
          value: redeemValue,
          branchId: branch?.id ?? null,
        });
      }

      // Earned on what they actually paid. The ledger row is the truth; the balance
      // on the contact is only a cache of it (§15.6).
      if (earned > 0 && s.customerId) {
        await tx.pointEntry.create({
          data: {
            contactId: s.customerId,
            saleId: sale.id,
            points: earned,
            type: "EARN",
            note: `Earned on ${sale.invoiceNo}`,
          },
        });
      }

      const pointsDelta = earned - redeemPoints;
      if (pointsDelta !== 0 && s.customerId) {
        await tx.contact.update({
          where: { id: s.customerId },
          data: { loyaltyPoints: { increment: pointsDelta } },
        });
      }

      // Goods worth more than the replacement — the difference goes back.
      if (ret && excess > 0) {
        if (ex?.refundAccountId) {
          await tx.payment.create({
            data: {
              direction: "OUT",
              amount: excess,
              method: ex.refundMethod || "CASH",
              accountId: ex.refundAccountId,
              contactId: s.customerId ?? null,
              saleReturnId: ret.id,
              note: `Exchange difference for ${ret.returnNo}`,
            },
          });
          await tx.account.update({
            where: { id: ex.refundAccountId },
            data: { balance: { decrement: excess } },
          });
        } else if (s.customerId) {
          // Kept on their account instead of handed over the counter.
          await tx.contact.update({
            where: { id: s.customerId },
            data: { dueBalance: { decrement: excess } },
          });
        }
      }

      // Whatever they didn't pay becomes a receivable on the customer.
      if (due > 0 && s.customerId) {
        await tx.contact.update({
          where: { id: s.customerId },
          data: { dueBalance: { increment: due } },
        });
      }

      if (ret && oldSale) {
        await tx.exchange.create({
          data: {
            exchangeNo: await nextExchangeNo(tx),
            fromSaleId: oldSale.id,
            toSaleId: sale.id,
            saleReturnId: ret.id,
            customerId: s.customerId ?? null,
            credit,
          },
        });
      }

      return sale.id;
    });

    revalidatePath("/sales");
    revalidatePath("/sale-returns");
    revalidatePath("/exchanges");
    revalidatePath("/inventory");
    revalidatePath("/customers");
    return { ok: true, saleId };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("oversold:")) {
      const [, name, have] = e.message.split(":");
      return { error: `Only ${have} of "${name}" in stock.` };
    }
    return { error: "Something went wrong completing the sale." };
  }
}

// ---------- Hold / park ----------

// The parked cart must carry the WHOLE line, pricing rules included. Zod strips
// what it doesn't declare, so anything missing here comes back off the hold shelf
// silently repriced — the server would still charge correctly (it re-reads the
// variant), but the cashier would be looking at the wrong number.
const holdSchema = z.object({
  label: z.string().trim().min(1, "Give the held sale a name").max(80),
  customerId: z.number().int().positive().nullable().optional(),
  cart: z.array(
    z.object({
      variantId: z.number().int().positive(),
      label: z.string(),
      sku: z.string(),
      qty: z.number(),
      price: z.number(),
      stockQty: z.number(),
      discountType: z.enum(["AMOUNT", "PERCENT"]).optional(),
      discountValue: z.number().optional(),
      wholesalePrice: z.number().nullable().optional(),
      wholesaleQty: z.number().nullable().optional(),
      minSalePrice: z.number().nullable().optional(),
      free: z.boolean().optional(),
    }),
  ),
});

export type HoldInput = z.input<typeof holdSchema>;

/** Park a cart. Deliberately touches no stock and no ledger. */
export async function holdSale(input: HoldInput): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requirePermission("pos.access");
  if (denied) return { error: denied };

  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.cart.length === 0) return { error: "The cart is empty." };

  const session = await auth();
  try {
    await prisma.heldSale.create({
      data: {
        label: parsed.data.label,
        customerId: parsed.data.customerId ?? null,
        cart: parsed.data.cart,
        heldById: session?.user?.id ? Number(session.user.id) : null,
      },
    });
  } catch {
    return { error: "Failed to hold the sale." };
  }
  revalidatePath("/pos");
  return { ok: true };
}

export async function resumeHeldSale(id: number) {
  const denied = await requirePermission("pos.access");
  if (denied) return null;

  const held = await prisma.heldSale.findUnique({ where: { id } });
  if (!held) return null;
  await prisma.heldSale.delete({ where: { id } });
  revalidatePath("/pos");
  return held;
}

export async function discardHeldSale(id: number): Promise<{ ok?: boolean; error?: string }> {
  const denied = await requirePermission("pos.access");
  if (denied) return { error: denied };

  try {
    await prisma.heldSale.delete({ where: { id } });
  } catch {
    return { error: "Failed to discard." };
  }
  revalidatePath("/pos");
  return { ok: true };
}
