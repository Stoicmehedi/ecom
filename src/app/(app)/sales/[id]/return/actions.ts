"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { avgAfterReversal, round2, round3 } from "@/lib/costing";
import { creditFor, validateReturnLines, writeSaleReturn } from "@/lib/sale-return";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

const schema = z.object({
  saleId: z.number().int().positive(),
  date: z.string().min(1, "Return date is required"),
  note: z.string().trim().max(500).optional(),
  refunded: z.number().min(0).default(0),
  refundMethod: z.string().trim().optional(),
  refundAccountId: z.number().int().nullable().optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.number().int().positive(),
        qty: z.number().min(0),
      }),
    )
    .min(1),
});

export type SaleReturnInput = z.input<typeof schema>;

export async function saveSaleReturn(input: SaleReturnInput): Promise<ActionResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = parsed.data;

  const lines = r.items.filter((i) => i.qty > 0);
  if (lines.length === 0) {
    return { error: "Enter a return quantity for at least one item." };
  }

  const sale = await prisma.sale.findUnique({
    where: { id: r.saleId },
    include: {
      items: { include: { variant: true } },
      customer: { select: { id: true, isWalkIn: true } },
    },
  });
  if (!sale) return { error: "Sale not found." };

  const invalid = validateReturnLines(sale, lines);
  if (invalid) return { error: invalid };

  const total = creditFor(sale, lines);

  if (r.refunded > total + 0.005) {
    return { error: "Refund is more than the value of the returned goods." };
  }

  // Crediting a walk-in would leave a balance owed to nobody — the money has to
  // go back across the counter.
  const isWalkIn = !sale.customerId || (sale.customer?.isWalkIn ?? false);
  if (isWalkIn && r.refunded < total - 0.005) {
    return {
      error: "A walk-in must be refunded in full — there is no account to credit.",
    };
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ret = await writeSaleReturn(tx, {
        sale,
        lines,
        date: new Date(r.date),
        note: r.note,
        refunded: r.refunded,
      });

      // Goods coming back cancel that much of the debt; cash handed over
      // reinstates it and leaves the drawer.
      if (sale.customerId) {
        const netDueChange = round2(r.refunded - total);
        await tx.contact.update({
          where: { id: sale.customerId },
          data: { dueBalance: { increment: netDueChange } },
        });
      }

      if (r.refunded > 0) {
        await tx.payment.create({
          data: {
            direction: "OUT",
            amount: round2(r.refunded),
            method: r.refundMethod || "CASH",
            accountId: r.refundAccountId ?? null,
            contactId: sale.customerId,
            saleReturnId: ret.id,
            date: new Date(r.date),
            note: `Refund for ${ret.returnNo}`,
          },
        });
        if (r.refundAccountId) {
          await tx.account.update({
            where: { id: r.refundAccountId },
            data: { balance: { decrement: round2(r.refunded) } },
          });
        }
      }

      return ret.id;
    });

    revalidatePath("/sales");
    revalidatePath("/sale-returns");
    revalidatePath("/inventory");
    revalidatePath("/customers");
    return { ok: true, id };
  } catch {
    return { error: "Something went wrong saving the return." };
  }
}

export async function deleteSaleReturn(id: number): Promise<ActionResult> {
  const ret = await prisma.saleReturn.findUnique({
    where: { id },
    include: { items: true, payments: true, exchange: true },
  });
  if (!ret) return { error: "Return not found." };

  // Half an exchange is not a thing. Undoing it here would leave the replacement
  // sale standing with nothing behind it — delete the exchange instead.
  if (ret.exchange) {
    return {
      error: "This return is part of an exchange — delete the exchange itself.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of ret.items) {
        const v = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
          select: { stockQty: true, purchasePrice: true },
        });
        const stock = Number(v.stockQty);
        const q = Number(item.qty);

        if (q > stock + 0.0005) {
          throw new Error("stock-gone");
        }

        // The goods leave again, at the cost they came back in at.
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQty: round3(stock - q),
            purchasePrice: avgAfterReversal(
              stock,
              Number(v.purchasePrice),
              q,
              Number(item.cost),
            ),
          },
        });

        await tx.saleItem.update({
          where: { id: item.saleItemId },
          data: { returnedQty: { decrement: round3(q) } },
        });
      }

      await tx.stockMovement.deleteMany({
        where: { refType: "sale_return", refId: id },
      });

      for (const p of ret.payments) {
        if (p.accountId) {
          await tx.account.update({
            where: { id: p.accountId },
            data: { balance: { increment: Number(p.amount) } },
          });
        }
      }
      await tx.payment.deleteMany({ where: { saleReturnId: id } });

      if (ret.customerId) {
        const netDueChange = round2(Number(ret.refunded) - Number(ret.total));
        await tx.contact.update({
          where: { id: ret.customerId },
          data: { dueBalance: { decrement: netDueChange } },
        });
      }

      await tx.saleReturn.delete({ where: { id } });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "stock-gone") {
      return {
        error: "Cannot delete: the returned stock has already been sold again.",
      };
    }
    return { error: "Failed to delete the return." };
  }

  revalidatePath("/sales");
  revalidatePath("/sale-returns");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  return { ok: true };
}
