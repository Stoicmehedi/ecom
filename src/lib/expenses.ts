/**
 * Expenses — the block the P&L was missing (BLUEPRINT §18).
 *
 * Two kinds of expense, one table:
 *
 *  - **A real expense** — rent, electricity, wages. It has an account, and saving
 *    it *moves money*: a `Payment` row (OUT) and the account balance drops. An
 *    expense that doesn't move the drawer is a lie on the P&L.
 *
 *  - **The loyalty-points expense** (§18.8) — posted automatically when a customer
 *    pays part of a bill in points. It has **no account and no payment**, because
 *    no cash crossed the counter (exactly like the `POINTS` payment and the
 *    `EXCHANGE` credit). It makes the scheme's cost *visible*; it does not pretend
 *    it was paid.
 *
 * Both land in the same P&L block, which is the whole point: the shopkeeper sees
 * what the loyalty scheme costs beside what the rent costs.
 */

import { round2 } from "./costing";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/** The system expense type that loyalty redemptions post against. */
export const LOYALTY_EXPENSE_TYPE = "Loyalty points";

/** Find-or-create the system type. It is never created by hand, so it is created here. */
export async function loyaltyExpenseTypeId(tx: Tx): Promise<number> {
  const existing = await tx.expenseType.findUnique({
    where: { name: LOYALTY_EXPENSE_TYPE },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.expenseType.create({
    data: { name: LOYALTY_EXPENSE_TYPE, isSystem: true },
    select: { id: true },
  });
  return created.id;
}

/**
 * Book what a points redemption cost the shop.
 *
 * `value` is the money the points were worth — the same figure the `POINTS`
 * payment settles the bill with. No account: nothing was paid out.
 */
export async function postLoyaltyExpense(
  tx: Tx,
  args: { saleId: number; invoiceNo: string; points: number; value: number; branchId?: number | null },
) {
  if (args.value <= 0) return;

  await tx.expense.create({
    data: {
      date: new Date(),
      amount: round2(args.value),
      expenseTypeId: await loyaltyExpenseTypeId(tx),
      accountId: null, // no cash moved — this is the whole point
      saleId: args.saleId,
      branchId: args.branchId ?? null,
      note: `${args.points} points redeemed on ${args.invoiceNo}`,
    },
  });
}

/**
 * Points came back on a return, so the cost of the scheme did too.
 *
 * Posted as a **negative expense** rather than by editing the original: the
 * original is what happened, and this is what happened next. Both rows stay on
 * the ledger and the P&L nets them, which is what a contra entry is for.
 */
export async function reverseLoyaltyExpense(
  tx: Tx,
  args: {
    saleId: number;
    saleReturnId: number;
    returnNo: string;
    points: number;
    value: number;
    branchId?: number | null;
  },
) {
  if (args.value <= 0) return;

  await tx.expense.create({
    data: {
      date: new Date(),
      amount: round2(-args.value),
      expenseTypeId: await loyaltyExpenseTypeId(tx),
      accountId: null,
      saleId: args.saleId,
      // Undo the return and this contra goes with it (cascade) — otherwise the cost
      // would stay clawed back after the customer's points had been taken away again.
      saleReturnId: args.saleReturnId,
      branchId: args.branchId ?? null,
      note: `${args.points} points returned on ${args.returnNo}`,
    },
  });
}
