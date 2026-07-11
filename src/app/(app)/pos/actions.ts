"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { docStatus, resolveDiscount, round2, round3 } from "@/lib/costing";
import type { Prisma } from "@/generated/prisma/client";

export type CheckoutResult = { ok?: boolean; error?: string; saleId?: number };

const lineSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().positive("Quantity must be greater than zero"),
  price: z.number().min(0, "Price cannot be negative"),
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

  // The same variant scanned twice is one line.
  const merged = new Map<number, { variantId: number; qty: number; price: number }>();
  for (const it of s.items) {
    const prev = merged.get(it.variantId);
    if (prev) {
      prev.qty = round3(prev.qty + it.qty);
      prev.price = it.price;
    } else {
      merged.set(it.variantId, { ...it });
    }
  }
  const items = [...merged.values()];

  // Overselling is blocked: check every line against stock before touching anything.
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: items.map((i) => i.variantId) } },
    include: { product: { select: { name: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  for (const it of items) {
    const v = byId.get(it.variantId);
    if (!v) return { error: "A product in the cart no longer exists." };
    const inStock = Number(v.stockQty);
    if (it.qty > inStock + 0.0005) {
      const label = v.label ? `${v.product.name} — ${v.label}` : v.product.name;
      return {
        error: `Only ${inStock} of "${label}" in stock — you cannot sell ${it.qty}.`,
      };
    }
  }

  const subtotal = round2(items.reduce((a, i) => a + i.qty * i.price, 0));
  const discount = resolveDiscount(subtotal, s.discountType, s.discountValue);
  const total = round2(subtotal - discount);

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
    if (!s.customerId) {
      return { error: "A credit sale needs a named customer — a walk-in must pay in full." };
    }
    const customer = await prisma.contact.findUnique({
      where: { id: s.customerId },
      select: { isWalkIn: true },
    });
    if (!customer) return { error: "That customer no longer exists." };
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
            price: round2(it.price),
            // Snapshot the cost NOW — the weighted average moves with later purchases,
            // and profit on this sale must be measured against what it cost today.
            costAtSale: round2(Number(v.purchasePrice)),
            subtotal: round2(it.qty * it.price),
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
