import { round2 } from "@/lib/costing";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * The shop's own money (BLUEPRINT §23).
 *
 * Every movement in MPoS already lands as a `Payment` row against an account — a
 * sale, a purchase, an expense, a due received. This file adds the three that
 * belong to no document at all: putting money in, taking money out, and moving it
 * between two of the shop's own accounts.
 *
 * A transfer is deliberately **two** payment rows, not one row touching two
 * accounts. One row would have to be read twice, with opposite signs, by every
 * screen that ever totals a column — and the first place that forgot would lose a
 * balance. Two rows and a link mean the statement needs no special case, and
 * undoing it is exact.
 */

/** A movement with no document behind it: the shop putting money in or taking it out. */
export type CashMove = {
  accountId: number;
  amount: number;
  date: Date;
  note?: string | null;
  method?: string | null;
};

/**
 * Money in or out of one account, belonging to no sale, purchase or expense.
 *
 * The same shape the loyalty credit and the exchange credit already use in the
 * other direction (§14, §18.8) — a `Payment` with no contact and no document.
 * Nothing new is invented here.
 */
export async function writeCashMove(
  tx: Tx,
  direction: "IN" | "OUT",
  move: CashMove,
): Promise<number> {
  const amount = round2(move.amount);

  const payment = await tx.payment.create({
    data: {
      direction,
      amount,
      method: move.method || "CASH",
      accountId: move.accountId,
      date: move.date,
      note: move.note?.trim() || (direction === "IN" ? "Deposit" : "Withdrawal"),
    },
  });

  await tx.account.update({
    where: { id: move.accountId },
    data: {
      balance: direction === "IN" ? { increment: amount } : { decrement: amount },
    },
  });

  return payment.id;
}

/** Undo a deposit or withdrawal: take the money back out, or put it back in. */
export async function reverseCashMove(tx: Tx, paymentId: number): Promise<void> {
  const p = await tx.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, direction: true, amount: true, accountId: true },
  });
  if (!p || !p.accountId) return;

  const amount = Number(p.amount);
  await tx.account.update({
    where: { id: p.accountId },
    data: {
      balance: p.direction === "IN" ? { decrement: amount } : { increment: amount },
    },
  });
  await tx.payment.delete({ where: { id: p.id } });
}

/**
 * A statement row: one movement, and what the account held after it.
 *
 * The running balance is computed here rather than stored, because it is a
 * *view* of the payments — storing it would create a second number that could
 * disagree with them.
 */
export type StatementRow = {
  date: string;
  /** "Sale", "Purchase", "Expense", "Transfer in"… — what moved the money. */
  type: string;
  /** The document it came from, if any. */
  ref: string;
  note: string;
  in: number;
  out: number;
  balance: number;
  href?: string;
};

/** A payment row, loaded with just enough of its document to name it. */
export type StatementPayment = {
  id: number;
  date: Date;
  amount: unknown;
  direction: string;
  note: string | null;
  saleId: number | null;
  purchaseId: number | null;
  saleReturnId: number | null;
  purchaseReturnId: number | null;
  expenseId: number | null;
  transferId: number | null;
  contactId: number | null;
  sale: { invoiceNo: string } | null;
  purchase: { purchaseNo: string } | null;
  saleReturn: { returnNo: string } | null;
  purchaseReturn: { returnNo: string } | null;
  expense: { expenseType: { name: string } } | null;
  contact: { name: string } | null;
};

/** What kind of movement a payment row represents, and where to read more. */
function describe(p: StatementPayment): { type: string; ref: string; href?: string } {
  if (p.saleId && p.sale) {
    return { type: "Sale", ref: p.sale.invoiceNo, href: `/sales/${p.saleId}` };
  }
  if (p.purchaseId && p.purchase) {
    return {
      type: "Purchase",
      ref: p.purchase.purchaseNo,
      href: `/purchases/${p.purchaseId}`,
    };
  }
  if (p.saleReturnId && p.saleReturn) {
    return { type: "Sale return", ref: p.saleReturn.returnNo, href: "/sale-returns" };
  }
  if (p.purchaseReturnId && p.purchaseReturn) {
    return {
      type: "Purchase return",
      ref: p.purchaseReturn.returnNo,
      href: "/purchase-returns",
    };
  }
  if (p.expenseId && p.expense) {
    // An expense has no document number — it is named by its type, which is what a
    // shopkeeper would look for anyway ("Rent", not "EXP-00007").
    return { type: "Expense", ref: p.expense.expenseType.name, href: "/expenses" };
  }
  if (p.transferId) {
    return {
      type: p.direction === "IN" ? "Transfer in" : "Transfer out",
      ref: `TRF-${String(p.transferId).padStart(5, "0")}`,
    };
  }
  // A payment against a contact with no document is a due settled on account.
  if (p.contactId && p.contact) {
    return {
      type: p.direction === "IN" ? "Due received" : "Due paid",
      ref: p.contact.name,
      href: `/customers/${p.contactId}`,
    };
  }
  return { type: p.direction === "IN" ? "Deposit" : "Withdrawal", ref: "—" };
}

/**
 * Every movement through an account, oldest first, with the running balance.
 *
 * Starts from the opening balance, so the last row's balance IS the account's
 * balance — and if it is not, one of them is wrong and the statement will say so.
 */
export function buildStatement(
  openingBalance: number,
  payments: StatementPayment[],
): StatementRow[] {
  let running = round2(openingBalance);
  return payments.map((p) => {
    const { type, ref, href } = describe(p);
    const amount = Number(p.amount);
    const isIn = p.direction === "IN";
    running = round2(running + (isIn ? amount : -amount));
    return {
      date: p.date.toISOString(),
      type,
      ref,
      note: p.note ?? "",
      in: isIn ? amount : 0,
      out: isIn ? 0 : amount,
      balance: running,
      href,
    };
  });
}
