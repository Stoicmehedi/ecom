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

/** The system expense type that a stock write-off posts against (§19.6). */
export const STOCK_LOSS_EXPENSE_TYPE = "Stock loss";

/** Find-or-create a system type. These are never created by hand, so they are created here. */
export async function systemExpenseTypeId(tx: Tx, name: string): Promise<number> {
  const existing = await tx.expenseType.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.expenseType.create({
    data: { name, isSystem: true },
    select: { id: true },
  });
  return created.id;
}

export const loyaltyExpenseTypeId = (tx: Tx) => systemExpenseTypeId(tx, LOYALTY_EXPENSE_TYPE);

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

/**
 * Book what a stock write-off cost the shop (§19.6).
 *
 * `value` is qty × weighted-average cost — what the goods actually cost us, not what
 * they would have sold for. Like the loyalty expense, it carries **no account**: the
 * shop lost *goods*, not cash, and no drawer is any lighter for it.
 *
 * Goods *found* are a negative expense — a contra — because finding stock is the
 * opposite of losing it, and the P&L should net the two.
 */
export async function postStockLossExpense(
  tx: Tx,
  args: {
    adjustmentId: number;
    adjustmentNo: string;
    typeName: string;
    value: number;
    branchId?: number | null;
  },
) {
  if (args.value === 0) return;

  await tx.expense.create({
    data: {
      date: new Date(),
      amount: round2(args.value),
      expenseTypeId: await systemExpenseTypeId(tx, STOCK_LOSS_EXPENSE_TYPE),
      accountId: null, // goods, not cash
      stockAdjustmentId: args.adjustmentId,
      branchId: args.branchId ?? null,
      note:
        args.value > 0
          ? `${args.typeName} written off on ${args.adjustmentNo}`
          : `Stock found on ${args.adjustmentNo} (${args.typeName})`,
    },
  });
}

/** The system expense type that wages post against (BLUEPRINT §24.2). */
export const SALARY_EXPENSE_TYPE = "Salary";

/**
 * Book wages as an ordinary expense.
 *
 * The reference app keeps salary in its own silo, with its own line on the P&L
 * beside "Expense". We don't: wages are money the shop spent, so they post the
 * same `Expense` every other cost does. That is what puts them into **Operating
 * expenses → Net profit** with no second code path that could forget them, and it
 * is what makes them show up by name on the account statement (§23).
 *
 * Unlike the loyalty and stock-loss expenses, this one HAS an account — the money
 * really did leave the drawer. The caller writes the matching `Payment`.
 */
export async function postSalaryExpense(
  tx: Tx,
  args: {
    salaryPaymentId: number;
    employeeName: string;
    monthLabel: string;
    amount: number;
    accountId: number | null;
    date: Date;
    branchId?: number | null;
  },
): Promise<number> {
  const expense = await tx.expense.create({
    data: {
      date: args.date,
      amount: round2(args.amount),
      expenseTypeId: await systemExpenseTypeId(tx, SALARY_EXPENSE_TYPE),
      accountId: args.accountId,
      salaryPaymentId: args.salaryPaymentId,
      branchId: args.branchId ?? null,
      note: `${args.employeeName} — ${args.monthLabel} salary`,
    },
  });
  return expense.id;
}
