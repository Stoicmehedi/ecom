"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { docStatus, resolveDiscount, round2, round3 } from "@/lib/costing";
import { priceLine } from "@/lib/pricing";
import type { Prisma } from "@/generated/prisma/client";

export type CheckoutResult = { ok?: boolean; error?: string; saleId?: number };

// The client sends WHAT and HOW MANY. It does not send the price — the server
// prices every line itself (BLUEPRINT §12.7a), because a price floor that the
// browser could talk its way around would not be a floor.
const lineSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().positive("Quantity must be greater than zero"),
});

const paymentSchema = z.object({
  method: z.string().trim().min(1),
  accountId: z.number().int().nullable().optional(),
  amount: z.number().min(0),
});

const checkoutSchema = z.object({
  customerId: z.number().int().positive().nullable().optional(),
  discountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
  discountValue: z.number().min(0).default(0),
  dueDate: z.string().optional(),
  note: z.string().trim().max(500).optional(),
  items: z.array(lineSchema).min(1, "The cart is empty"),
  payments: z.array(paymentSchema).default([]),
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

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;

  // The same variant scanned twice is one line — and it must be, or the wholesale
  // threshold could be dodged by scanning 5 × 1 instead of 1 × 5.
  const merged = new Map<number, { variantId: number; qty: number }>();
  for (const it of s.items) {
    const prev = merged.get(it.variantId);
    if (prev) prev.qty = round3(prev.qty + it.qty);
    else merged.set(it.variantId, { ...it });
  }
  const lines = [...merged.values()];

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((i) => i.variantId) } },
    include: {
      product: { select: { name: true, minSalePrice: true, isActive: true } },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  // The customer's group rate is one of the two candidate discounts per line.
  const customer = s.customerId
    ? await prisma.contact.findUnique({
        where: { id: s.customerId },
        select: { isWalkIn: true, customerGroup: { select: { discount: true } } },
      })
    : null;
  if (s.customerId && !customer) return { error: "That customer no longer exists." };

  const groupPct = Number(customer?.customerGroup?.discount ?? 0);

  // A manual bill discount REPLACES the automatic one rather than adding to it —
  // stacking every discount is how a shop gives itself away (BLUEPRINT §12.7a).
  const manual = round2(s.discountValue) > 0;

  const nameOf = (v: (typeof variants)[number]) =>
    v.label ? `${v.product.name} — ${v.label}` : v.product.name;

  const items: {
    variantId: number;
    qty: number;
    listPrice: number;
    price: number;
    discount: number;
    subtotal: number;
  }[] = [];

  for (const it of lines) {
    const v = byId.get(it.variantId);
    if (!v) return { error: "A product in the cart no longer exists." };
    if (!v.product.isActive) {
      return { error: `"${nameOf(v)}" is no longer on sale.` };
    }

    // Overselling is blocked — stock can never go negative.
    const inStock = Number(v.stockQty);
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
    });
  }

  // `subtotal` is already net of every per-line discount, so `discount` below
  // carries ONLY the bill-level one. That keeps the discount-apportioning rule
  // for returns (§10.1a) and product profit (§11.6) exact, with no special cases.
  const subtotal = round2(items.reduce((a, i) => a + i.subtotal, 0));
  const discount = resolveDiscount(subtotal, s.discountType, s.discountValue);
  const total = round2(subtotal - discount);

  // A bill discount must not sneak a line under its floor either.
  if (discount > 0) {
    const ratio = subtotal > 0 ? (subtotal - discount) / subtotal : 1;
    for (const it of items) {
      const v = byId.get(it.variantId)!;
      const min = v.product.minSalePrice == null ? 0 : Number(v.product.minSalePrice);
      if (min > 0 && it.price * ratio < min - 0.005) {
        return {
          error: `That bill discount would push "${nameOf(v)}" below its ${min.toFixed(2)} minimum.`,
        };
      }
    }
  }

  const payments = s.payments.filter((p) => p.amount > 0);
  const paid = round2(payments.reduce((a, p) => a + p.amount, 0));
  if (paid > total + 0.005) {
    return { error: "Paid amount is more than the sale total." };
  }
  const due = round2(total - paid);

  // A credit sale must be attached to someone we can actually chase. The walk-in
  // customer has an id, so checking for a missing id is not enough — a due parked
  // on "Walk-in" is a receivable owed by nobody.
  if (due > 0) {
    if (!s.customerId || !customer) {
      return { error: "A credit sale needs a named customer — a walk-in must pay in full." };
    }
    if (customer.isWalkIn) {
      return { error: "A walk-in must pay in full — pick a named customer to sell on credit." };
    }
  }

  const session = await auth();
  const soldById = session?.user?.id ? Number(session.user.id) : null;

  try {
    const saleId = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ select: { id: true } });

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

      // Whatever they didn't pay becomes a receivable on the customer.
      if (due > 0 && s.customerId) {
        await tx.contact.update({
          where: { id: s.customerId },
          data: { dueBalance: { increment: due } },
        });
      }

      return sale.id;
    });

    revalidatePath("/sales");
    revalidatePath("/inventory");
    revalidatePath("/customers");
    return { ok: true, saleId };
  } catch {
    return { error: "Something went wrong completing the sale." };
  }
}

// ---------- Hold / park ----------

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
    }),
  ),
});

export type HoldInput = z.input<typeof holdSchema>;

/** Park a cart. Deliberately touches no stock and no ledger. */
export async function holdSale(input: HoldInput): Promise<{ ok?: boolean; error?: string }> {
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
  const held = await prisma.heldSale.findUnique({ where: { id } });
  if (!held) return null;
  await prisma.heldSale.delete({ where: { id } });
  revalidatePath("/pos");
  return held;
}

export async function discardHeldSale(id: number): Promise<{ ok?: boolean; error?: string }> {
  try {
    await prisma.heldSale.delete({ where: { id } });
  } catch {
    return { error: "Failed to discard." };
  }
  revalidatePath("/pos");
  return { ok: true };
}
