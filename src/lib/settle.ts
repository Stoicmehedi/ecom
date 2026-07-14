import { round2 } from "@/lib/costing";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Settling a debt against invoices (BLUEPRINT §22).
 *
 * What a customer owes was written down twice — on the **invoice** (`Sale.due`)
 * and on the **account** (`Contact.dueBalance`) — and every post-sale movement
 * updated only the account. So a customer who paid off a credit sale in full still
 * had an invoice reading "due 100", and the Dues report (built from invoices)
 * chased them for money they had already handed over.
 *
 * The rule, in one sentence:
 *
 *   > **A debt is settled against invoices, oldest first. The account balance is
 *   > what is left over.**
 *
 * Both movements funnel through here — money paid, and goods handed back — so the
 * two cannot drift apart. Every landing writes a `DueAllocation` row, which is
 * what lets a deletion be reversed *exactly* rather than re-derived (§22.4).
 */

export type SettleRef = { paymentId?: number; saleReturnId?: number };

export type Settlement = {
  /** What actually landed on invoices. */
  applied: number;
  /** What was left once every open invoice was settled — an advance on the account. */
  advance: number;
  /** Invoice ids touched, oldest first. */
  saleIds: number[];
};

/**
 * Apply `amount` to a customer's open invoices, oldest first.
 *
 * `preferSaleId` jumps one invoice to the front of the queue. A return credit uses
 * it to settle **its own invoice first** — the goods came off *that* bill, so it is
 * the one that should shrink — before any surplus spills to older ones.
 *
 * Returns what landed and what was left over. The caller owns the account balance:
 * this function deliberately does not touch `Contact.dueBalance`, because the
 * account moves by the same amount whether or not there was an invoice to land on.
 */
export async function settleAgainstInvoices(
  tx: Tx,
  args: {
    contactId: number;
    amount: number;
    kind: "PAYMENT" | "CREDIT";
    ref: SettleRef;
    date: Date;
    preferSaleId?: number;
  },
): Promise<Settlement> {
  const amount = round2(args.amount);
  if (amount <= 0) return { applied: 0, advance: 0, saleIds: [] };

  const open = await tx.sale.findMany({
    where: { customerId: args.contactId, due: { gt: 0 } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
    select: { id: true, due: true, paid: true, credited: true, total: true },
  });

  // The goods' own invoice goes first; everything else is oldest-first.
  const queue = args.preferSaleId
    ? [
        ...open.filter((s) => s.id === args.preferSaleId),
        ...open.filter((s) => s.id !== args.preferSaleId),
      ]
    : open;

  let left = amount;
  const saleIds: number[] = [];

  for (const sale of queue) {
    if (left <= 0.005) break;

    const due = Number(sale.due);
    const hit = round2(Math.min(due, left));
    if (hit <= 0) continue;

    const paid = args.kind === "PAYMENT" ? round2(Number(sale.paid) + hit) : Number(sale.paid);
    const credited =
      args.kind === "CREDIT" ? round2(Number(sale.credited) + hit) : Number(sale.credited);
    const nowDue = round2(due - hit);

    await tx.sale.update({
      where: { id: sale.id },
      data: {
        paid,
        credited,
        due: nowDue,
        // An invoice with nothing left owing is settled, however it got there.
        status: nowDue <= 0.005 ? "PAID" : "PARTIAL",
      },
    });

    await tx.dueAllocation.create({
      data: {
        kind: args.kind,
        amount: hit,
        date: args.date,
        saleId: sale.id,
        contactId: args.contactId,
        paymentId: args.ref.paymentId ?? null,
        saleReturnId: args.ref.saleReturnId ?? null,
      },
    });

    saleIds.push(sale.id);
    left = round2(left - hit);
  }

  return { applied: round2(amount - left), advance: round2(left), saleIds };
}

/**
 * Undo every allocation a payment or a return made — putting the exact amounts
 * back on the exact invoices (§22.4).
 *
 * Re-deriving which invoices a deleted payment had settled is guesswork the moment
 * a second payment has been made. Reading back the rows it wrote is not.
 *
 * The `DueAllocation` rows themselves cascade away with the payment/return, so
 * this only has to undo their *effect*.
 */
export async function unsettle(tx: Tx, ref: SettleRef): Promise<number> {
  const rows = await tx.dueAllocation.findMany({
    where: {
      ...(ref.paymentId ? { paymentId: ref.paymentId } : {}),
      ...(ref.saleReturnId ? { saleReturnId: ref.saleReturnId } : {}),
    },
    select: { id: true, saleId: true, amount: true, kind: true },
  });

  let undone = 0;

  for (const row of rows) {
    const sale = await tx.sale.findUnique({
      where: { id: row.saleId },
      select: { paid: true, credited: true, due: true, total: true },
    });
    if (!sale) continue;

    const amount = Number(row.amount);
    const paid = row.kind === "PAYMENT" ? round2(Number(sale.paid) - amount) : Number(sale.paid);
    const credited =
      row.kind === "CREDIT" ? round2(Number(sale.credited) - amount) : Number(sale.credited);
    const due = round2(Number(sale.due) + amount);

    await tx.sale.update({
      where: { id: row.saleId },
      data: {
        paid,
        credited,
        due,
        // Re-opening an invoice: DUE if nothing has been settled on it at all.
        status: paid + credited <= 0.005 ? "DUE" : "PARTIAL",
      },
    });

    await tx.dueAllocation.delete({ where: { id: row.id } });
    undone = round2(undone + amount);
  }

  return undone;
}
