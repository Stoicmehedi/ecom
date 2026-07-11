"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { round2, round3 } from "@/lib/costing";

export type ActionState = { ok?: boolean; error?: string };

/**
 * Delete a sale and put everything back: stock returns to the shelf, the
 * customer's receivable is cleared, and the money leaves the account again.
 *
 * A sale is never edited (see BLUEPRINT §9.8) — a mistake is either deleted
 * outright or corrected with a sale return.
 */
export async function deleteSale(id: number): Promise<ActionState> {
  const sale = await prisma.sale.findUnique({
    where: { id },
    include: { items: true, payments: true },
  });
  if (!sale) return { error: "Sale not found." };

  try {
    await prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: { stockQty: { increment: round3(Number(item.qty)) } },
        });
      }

      await tx.stockMovement.deleteMany({ where: { refType: "sale", refId: id } });

      for (const p of sale.payments) {
        if (p.accountId) {
          await tx.account.update({
            where: { id: p.accountId },
            data: { balance: { decrement: Number(p.amount) } },
          });
        }
      }
      await tx.payment.deleteMany({ where: { saleId: id } });

      if (sale.customerId && Number(sale.due) > 0) {
        await tx.contact.update({
          where: { id: sale.customerId },
          data: { dueBalance: { decrement: round2(Number(sale.due)) } },
        });
      }

      await tx.sale.delete({ where: { id } });
    });
  } catch {
    return { error: "Failed to delete the sale." };
  }

  revalidatePath("/sales");
  revalidatePath("/inventory");
  revalidatePath("/customers");
  return { ok: true };
}
