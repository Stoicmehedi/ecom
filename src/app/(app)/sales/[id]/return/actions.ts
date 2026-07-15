"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { avgAfterReversal, round2, round3 } from "@/lib/costing";
import { validateReturnLines, writeSaleReturn } from "@/lib/sale-return";
import { getSettings } from "@/lib/settings";
import { settleAgainstInvoices, unsettle } from "@/lib/settle";
import { requirePermission } from "@/lib/guard";
import { logActivity, activityActor } from "@/lib/activity";

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
  const denied = await requirePermission("sales.return");
  if (denied) return { error: denied };

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
      items: {
        include: {
          // The unit comes along so the whole-unit rule can be applied (§21).
          variant: {
            include: { product: { select: { unit: { select: { name: true, allowDecimal: true } } } } },
          },
        },
      },
      customer: { select: { id: true, isWalkIn: true } },
    },
  });
  if (!sale) return { error: "Sale not found." };

  const invalid = validateReturnLines(sale, lines);
  if (invalid) return { error: invalid };

  const settings = await getSettings();

  // The credit itself is computed inside `writeSaleReturn`, which is also what the
  // exchange calls — one copy of the maths (§10.1a, §15.5). Part of the bill may
  // have been paid in points, and those come back as points, so what lands on the
  // account is `payable`, not the goods' full worth.

  // **Cash never goes back to a customer** (BLUEPRINT §22.3, settled with the user).
  // A return is always a credit. The screen no longer offers a refund; this refuses
  // one even if the browser sends it, because a control that must never be used is
  // a trap, and a rule the browser can talk around is not a rule.
  if (r.refunded > 0.005) {
    return {
      error:
        "A return is credited to the customer's account — money never goes back across the counter.",
    };
  }

  // **Only a registered customer can hold a credit** (§22.3). A walk-in has no
  // account, so crediting one would park a balance owed to nobody — the same trap
  // as a due on a walk-in (§9.8). They must be registered at the counter, or
  // exchange the goods instead (§14), which needs no account at all.
  const isWalkIn = !sale.customerId || (sale.customer?.isWalkIn ?? false);
  if (isWalkIn) {
    return {
      error:
        "A walk-in has no account to credit. Add them as a customer first, or exchange the goods instead.",
    };
  }
  const customerId = sale.customerId as number;

  const actor = await activityActor();

  try {
    const id = await prisma.$transaction(async (tx) => {
      const ret = await writeSaleReturn(tx, {
        sale,
        lines,
        date: new Date(r.date),
        note: r.note,
        refunded: 0,
        settings,
      });

      // The goods' worth, less any points handed back with them — those return as
      // points, not as money (§15.5), or they would launder into cash.
      const credit = ret.payable;

      // The credit settles THIS invoice first — the goods came off this bill — and
      // only then spills to the customer's other open invoices, oldest first (§22.3).
      await settleAgainstInvoices(tx, {
        contactId: customerId,
        amount: credit,
        kind: "CREDIT",
        ref: { saleReturnId: ret.id },
        date: new Date(r.date),
        preferSaleId: sale.id,
      });

      // The account falls by the whole credit whether or not there was an invoice
      // left to land it on — any surplus simply becomes an advance.
      await tx.contact.update({
        where: { id: customerId },
        data: { dueBalance: { decrement: credit } },
      });

      await logActivity(tx, {
        module: "Sale Return",
        action: "Created",
        details: `Return ${ret.returnNo} against ${sale.invoiceNo} — credit ${credit.toFixed(2)}`,
        actor,
      });

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
  const denied = await requirePermission("sales.return");
  if (denied) return { error: denied };

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

  const actor = await activityActor();

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
        // Re-open the exact invoices this credit closed, by the exact amounts
        // (§22.4). Re-deriving them would be guesswork the moment another payment
        // has landed since; reading back the rows it wrote is not.
        await unsettle(tx, { saleReturnId: id });

        // `moneyCredit`, not `total` — the points part never touched the ledger.
        const netDueChange = round2(Number(ret.refunded) - Number(ret.moneyCredit));
        await tx.contact.update({
          where: { id: ret.customerId },
          data: { dueBalance: { decrement: netDueChange } },
        });

        // Undo the points exactly as they moved: the ledger rows ARE what happened,
        // so summing them cannot drift, even if the point value was edited since.
        const entries = await tx.pointEntry.findMany({ where: { saleReturnId: id } });
        const delta = entries.reduce((a, e) => a + e.points, 0);
        if (delta !== 0) {
          await tx.contact.update({
            where: { id: ret.customerId },
            data: { loyaltyPoints: { decrement: delta } },
          });
        }
      }

      await tx.saleReturn.delete({ where: { id } });

      await logActivity(tx, {
        module: "Sale Return",
        action: "Deleted",
        details: `Return ${ret.returnNo} deleted`,
        actor,
      });
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
