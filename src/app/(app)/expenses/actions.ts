"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { round2 } from "@/lib/costing";
import { LOYALTY_EXPENSE_TYPE } from "@/lib/expenses";
import type { Prisma } from "@/generated/prisma/client";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

type Tx = Prisma.TransactionClient;

/**
 * Every entry point here is Admin-only (BLUEPRINT §18.8). Rent and wages are not a
 * cashier's business — and net profit must not become a back door into the
 * Admin-only profit figures (§11.2). Checked on the server, so it holds no matter
 * what the browser sends.
 */
async function requireManage(): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return "You are not signed in.";
  if (!hasPermission(session, "expenses.manage")) {
    return "You do not have permission to manage expenses.";
  }
  return null;
}

async function currentUserId(): Promise<number | null> {
  const session = await auth();
  const id = session?.user?.id;
  return id ? Number(id) : null;
}

const expenseSchema = z.object({
  id: z.number().int().optional(),
  date: z.string().min(1, "Date is required"),
  expenseTypeId: z.number().int().positive("Choose an expense type"),
  accountId: z.number().int().positive("Choose the account it was paid from"),
  amount: z.number().positive("Amount must be greater than zero"),
  note: z.string().trim().max(500).optional(),
});

export type ExpenseInput = z.input<typeof expenseSchema>;

/**
 * An automatic expense (the loyalty one) is owned by its sale — it is not something
 * a person entered, so it is not something a person may edit or delete. Editing it
 * by hand would let someone quietly rewrite what the loyalty scheme cost.
 */
function isAutomatic(e: { saleId: number | null }): boolean {
  return e.saleId !== null;
}

/** Undo what an expense did to the drawer: give the money back, drop the payment. */
async function reverseExpense(tx: Tx, id: number) {
  const payments = await tx.payment.findMany({ where: { expenseId: id } });
  for (const p of payments) {
    if (p.accountId) {
      await tx.account.update({
        where: { id: p.accountId },
        data: { balance: { increment: Number(p.amount) } },
      });
    }
  }
  await tx.payment.deleteMany({ where: { expenseId: id } });
}

/** Take the money out of the chosen account, and record what left. */
async function postExpense(
  tx: Tx,
  args: { id: number; accountId: number; amount: number; date: Date; note?: string | null },
) {
  await tx.payment.create({
    data: {
      direction: "OUT",
      amount: round2(args.amount),
      method: "Expense",
      accountId: args.accountId,
      expenseId: args.id,
      date: args.date,
      note: args.note ?? "Expense",
    },
  });
  await tx.account.update({
    where: { id: args.accountId },
    data: { balance: { decrement: round2(args.amount) } },
  });
}

export async function saveExpense(input: ExpenseInput): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;

  if (e.id) {
    const existing = await prisma.expense.findUnique({
      where: { id: e.id },
      select: { saleId: true },
    });
    if (!existing) return { error: "That expense no longer exists." };
    if (isAutomatic(existing)) {
      return { error: "This expense was posted automatically by a sale and cannot be edited." };
    }
  }

  const userId = await currentUserId();
  const amount = round2(e.amount);
  const date = new Date(e.date);

  try {
    const id = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findFirst({ select: { id: true } });

      const data = {
        date,
        amount,
        expenseTypeId: e.expenseTypeId,
        accountId: e.accountId,
        note: e.note?.trim() || null,
        branchId: branch?.id ?? null,
      };

      let expenseId: number;
      if (e.id) {
        // Reverse the old money movement, then post the new one — the same
        // discipline a purchase edit follows.
        await reverseExpense(tx, e.id);
        await tx.expense.update({ where: { id: e.id }, data });
        expenseId = e.id;
      } else {
        const created = await tx.expense.create({
          data: { ...data, createdById: userId },
        });
        expenseId = created.id;
      }

      await postExpense(tx, {
        id: expenseId,
        accountId: e.accountId,
        amount,
        date,
        note: data.note,
      });

      return expenseId;
    });

    revalidatePath("/expenses");
    revalidatePath("/reports");
    return { ok: true, id };
  } catch {
    return { error: "Something went wrong saving the expense." };
  }
}

export async function deleteExpense(id: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const existing = await prisma.expense.findUnique({
    where: { id },
    select: { saleId: true },
  });
  if (!existing) return { error: "That expense no longer exists." };
  if (isAutomatic(existing)) {
    return {
      error: "This expense was posted automatically by a sale. Delete the sale to reverse it.",
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await reverseExpense(tx, id);
      await tx.expense.delete({ where: { id } });
    });
  } catch {
    return { error: "Failed to delete the expense." };
  }

  revalidatePath("/expenses");
  revalidatePath("/reports");
  return { ok: true };
}

// ------------------------------------------------------------ expense types

const typeSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().trim().min(1, "Name is required").max(60),
});

export async function saveExpenseType(input: z.input<typeof typeSchema>): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, name } = parsed.data;

  if (name.toLowerCase() === LOYALTY_EXPENSE_TYPE.toLowerCase() && !id) {
    return { error: `"${LOYALTY_EXPENSE_TYPE}" is posted automatically and already exists.` };
  }

  if (id) {
    const existing = await prisma.expenseType.findUnique({
      where: { id },
      select: { isSystem: true },
    });
    if (existing?.isSystem) {
      return { error: "That type is posted automatically and cannot be renamed." };
    }
  }

  try {
    if (id) {
      await prisma.expenseType.update({ where: { id }, data: { name } });
    } else {
      await prisma.expenseType.create({ data: { name } });
    }
  } catch {
    return { error: "An expense type with that name already exists." };
  }

  revalidatePath("/expenses");
  return { ok: true };
}

export async function deleteExpenseType(id: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const type = await prisma.expenseType.findUnique({
    where: { id },
    select: { isSystem: true, _count: { select: { expenses: true } } },
  });
  if (!type) return { error: "That type no longer exists." };
  if (type.isSystem) {
    return { error: "That type is posted automatically and cannot be deleted." };
  }
  // An optional FK would be ON DELETE SET NULL and would silently orphan the
  // expenses — the exact trap the customer-group delete fell into. Refuse instead.
  if (type._count.expenses > 0) {
    return {
      error: `${type._count.expenses} expense(s) use this type. Delete or re-type them first.`,
    };
  }

  try {
    await prisma.expenseType.delete({ where: { id } });
  } catch {
    return { error: "Failed to delete the expense type." };
  }

  revalidatePath("/expenses");
  return { ok: true };
}
