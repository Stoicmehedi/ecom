"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkVariantQtys } from "@/lib/qty-server";
import { revalidatePath } from "next/cache";
import {
  avgAfterPurchase,
  avgAfterReversal,
  docStatus,
  resolveDiscount,
  round2,
  round3,
} from "@/lib/costing";
import type { Prisma } from "@/generated/prisma/client";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const lineSchema = z.object({
  variantId: z.number().int().positive(),
  qty: z.number().positive("Quantity must be greater than zero"),
  purchasePrice: z.number().min(0, "Purchase price cannot be negative"),
});

const paymentSchema = z.object({
  method: z.string().trim().min(1),
  accountId: z.number().int().nullable().optional(),
  amount: z.number().min(0),
});

const purchaseSchema = z.object({
  id: z.number().int().optional(),
  supplierId: z.number().int({ message: "Supplier is required" }).positive("Supplier is required"),
  date: z.string().min(1, "Purchase date is required"),
  supplierInvoiceNo: z.string().trim().max(64).optional(),
  dueDate: z.string().optional(),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(500).optional(),
  discountType: z.enum(["AMOUNT", "PERCENT"]).default("AMOUNT"),
  discountValue: z.number().min(0).default(0),
  items: z.array(lineSchema).min(1, "Add at least one product"),
  payments: z.array(paymentSchema).default([]),
});

export type PurchaseInput = z.input<typeof purchaseSchema>;

type Tx = Prisma.TransactionClient;

async function nextPurchaseNo(tx: Tx): Promise<string> {
  const last = await tx.purchase.findFirst({
    orderBy: { id: "desc" },
    select: { purchaseNo: true },
  });
  const n = last ? parseInt(last.purchaseNo.replace(/\D/g, ""), 10) || 0 : 0;
  return `PUR-${String(n + 1).padStart(5, "0")}`;
}

/**
 * A purchase becomes locked once its stock may have moved on: it has been
 * returned, or a sale of any purchased variant happened on/after its date.
 * Reversing it then could not be done without corrupting stock and cost.
 */
async function lockReason(purchaseId: number): Promise<string | null> {
  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { date: true, items: { select: { variantId: true } } },
  });
  if (!purchase) return "Purchase not found.";

  const returns = await prisma.purchaseReturn.count({ where: { purchaseId } });
  if (returns > 0) {
    return "This purchase has a return against it. Delete the return first.";
  }

  const variantIds = purchase.items.map((i) => i.variantId);
  const sold = await prisma.saleItem.count({
    where: { variantId: { in: variantIds }, sale: { date: { gte: purchase.date } } },
  });
  if (sold > 0) {
    return "Stock from this purchase has already been sold, so it can no longer be changed.";
  }
  return null;
}

/** Add received goods to a variant: stock up, weighted-average cost re-based. */
async function receiveStock(
  tx: Tx,
  purchaseId: number,
  variantId: number,
  qty: number,
  price: number,
) {
  const v = await tx.productVariant.findUnique({
    where: { id: variantId },
    select: { stockQty: true, purchasePrice: true },
  });
  if (!v) throw new Error("Variant not found");

  const stock = Number(v.stockQty);
  const avg = Number(v.purchasePrice);

  await tx.productVariant.update({
    where: { id: variantId },
    data: {
      stockQty: round3(stock + qty),
      purchasePrice: avgAfterPurchase(stock, avg, qty, price),
      lastPurchasePrice: round2(price),
    },
  });

  await tx.stockMovement.create({
    data: {
      variantId,
      type: "PURCHASE",
      qty: round3(qty),
      refType: "purchase",
      refId: purchaseId,
    },
  });
}

/** Undo everything a purchase did: stock, cost, movements, payments, payable. */
async function reversePurchase(tx: Tx, purchaseId: number) {
  const purchase = await tx.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: true, payments: true },
  });
  if (!purchase) throw new Error("Purchase not found");

  for (const item of purchase.items) {
    const v = await tx.productVariant.findUnique({
      where: { id: item.variantId },
      select: { stockQty: true, purchasePrice: true },
    });
    if (!v) continue;
    const stock = Number(v.stockQty);
    const avg = Number(v.purchasePrice);
    const qty = Number(item.qty);
    const price = Number(item.purchasePrice);

    await tx.productVariant.update({
      where: { id: item.variantId },
      data: {
        stockQty: round3(stock - qty),
        purchasePrice: avgAfterReversal(stock, avg, qty, price),
      },
    });
  }

  await tx.stockMovement.deleteMany({
    where: { refType: "purchase", refId: purchaseId },
  });

  // Give back the money: restore account balances, then drop the payment rows.
  for (const p of purchase.payments) {
    if (p.accountId) {
      await tx.account.update({
        where: { id: p.accountId },
        data: { balance: { increment: Number(p.amount) } },
      });
    }
  }
  await tx.payment.deleteMany({ where: { purchaseId } });

  if (purchase.supplierId) {
    const owed = Number(purchase.total) - Number(purchase.paid);
    await tx.contact.update({
      where: { id: purchase.supplierId },
      data: { dueBalance: { decrement: round2(owed) } },
    });
  }
}

export async function savePurchase(input: PurchaseInput): Promise<ActionResult> {
  const parsed = purchaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  // Same variant added twice → one line.
  const merged = new Map<number, { variantId: number; qty: number; purchasePrice: number }>();
  for (const it of p.items) {
    const prev = merged.get(it.variantId);
    if (prev) {
      prev.qty = round3(prev.qty + it.qty);
      prev.purchasePrice = it.purchasePrice;
    } else {
      merged.set(it.variantId, { ...it });
    }
  }
  const items = [...merged.values()];

  // Half a shirt cannot be bought any more than it can be sold (§21).
  const badQty = await checkVariantQtys(prisma, items);
  if (badQty) return { error: badQty };

  const subtotal = round2(items.reduce((s, i) => s + i.qty * i.purchasePrice, 0));
  const discount = resolveDiscount(subtotal, p.discountType, p.discountValue);
  const total = round2(subtotal - discount);

  const payments = p.payments.filter((pay) => pay.amount > 0);
  const paid = round2(payments.reduce((s, pay) => s + pay.amount, 0));
  if (paid > total + 0.005) {
    return { error: "Paid amount is more than the purchase total." };
  }
  const due = round2(total - paid);

  if (p.id) {
    const locked = await lockReason(p.id);
    if (locked) return { error: locked };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      if (p.id) await reversePurchase(tx, p.id);

      const branch = await tx.branch.findFirst({ select: { id: true } });

      const header = {
        supplierId: p.supplierId,
        branchId: branch?.id ?? null,
        date: new Date(p.date),
        dueDate: p.dueDate ? new Date(p.dueDate) : null,
        supplierInvoiceNo: p.supplierInvoiceNo?.trim() || null,
        reference: p.reference?.trim() || null,
        note: p.note?.trim() || null,
        subtotal,
        discountType: p.discountType,
        discountValue: round2(p.discountValue),
        discount,
        total,
        paid,
        due,
        status: docStatus(total, paid),
      };

      let purchaseId: number;
      if (p.id) {
        await tx.purchase.update({ where: { id: p.id }, data: header });
        await tx.purchaseItem.deleteMany({ where: { purchaseId: p.id } });
        purchaseId = p.id;
      } else {
        const created = await tx.purchase.create({
          data: { ...header, purchaseNo: await nextPurchaseNo(tx) },
        });
        purchaseId = created.id;
      }

      for (const it of items) {
        await tx.purchaseItem.create({
          data: {
            purchaseId,
            variantId: it.variantId,
            qty: round3(it.qty),
            purchasePrice: round2(it.purchasePrice),
            subtotal: round2(it.qty * it.purchasePrice),
          },
        });
        await receiveStock(tx, purchaseId, it.variantId, it.qty, it.purchasePrice);
      }

      for (const pay of payments) {
        await tx.payment.create({
          data: {
            direction: "OUT",
            amount: round2(pay.amount),
            method: pay.method,
            accountId: pay.accountId ?? null,
            contactId: p.supplierId,
            purchaseId,
            date: new Date(p.date),
            note: "Purchase payment",
          },
        });
        if (pay.accountId) {
          await tx.account.update({
            where: { id: pay.accountId },
            data: { balance: { decrement: round2(pay.amount) } },
          });
        }
      }

      // What's still unpaid becomes a payable on the supplier.
      await tx.contact.update({
        where: { id: p.supplierId },
        data: { dueBalance: { increment: due } },
      });

      return purchaseId;
    });

    revalidatePath("/purchases");
    revalidatePath("/inventory");
    revalidatePath("/suppliers");
    return { ok: true, id };
  } catch {
    return { error: "Something went wrong saving the purchase." };
  }
}

export async function deletePurchase(id: number): Promise<ActionResult> {
  const locked = await lockReason(id);
  if (locked) return { error: locked };

  try {
    await prisma.$transaction(async (tx) => {
      await reversePurchase(tx, id);
      await tx.purchase.delete({ where: { id } });
    });
  } catch {
    return { error: "Failed to delete the purchase." };
  }

  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/suppliers");
  return { ok: true };
}
