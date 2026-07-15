"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/guard";
import { round2 } from "@/lib/costing";
import { writeCashMove, reverseCashMove } from "@/lib/accounts";
import { logActivity, activityActor } from "@/lib/activity";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

/**
 * Admin-only (BLUEPRINT §23.3). Moving money by hand is, with the stock adjustment
 * (§19.7), the easiest place in the app to hide theft: a withdrawal with a vague
 * note takes cash out of the books and asks nobody's permission. So the gate is on
 * the server, not the browser.
 */
async function requireManage(): Promise<string | null> {
  return requirePermission("accounts.manage");
}

// ---------- The accounts themselves ----------

const accountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  type: z.enum(["CASH", "BANK", "MOBILE"]),
  bankName: z.string().trim().max(100).optional(),
  accountNumber: z.string().trim().max(60).optional(),
  openingBalance: z.coerce.number().min(0).default(0),
});

export async function saveAccount(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    bankName: formData.get("bankName") || undefined,
    accountNumber: formData.get("accountNumber") || undefined,
    openingBalance: formData.get("openingBalance") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const a = parsed.data;

  const data = {
    name: a.name,
    type: a.type,
    bankName: a.bankName || null,
    accountNumber: a.accountNumber || null,
    openingBalance: round2(a.openingBalance),
  };

  try {
    if (id) {
      const existing = await prisma.account.findUnique({
        where: { id },
        select: { openingBalance: true, balance: true },
      });
      if (!existing) return { error: "Account not found." };

      // The opening balance is part of what the account HOLDS, so changing it must
      // shift the running balance by the same delta — exactly as a customer's
      // opening balance does (§8). Otherwise correcting a typo in the float would
      // silently create or destroy money.
      const delta = round2(data.openingBalance - Number(existing.openingBalance));
      const balance = round2(Number(existing.balance) + delta);
      if (balance < -0.005) {
        return {
          error: "That opening balance would leave the account with less than nothing.",
        };
      }
      await prisma.account.update({ where: { id }, data: { ...data, balance } });
      await logActivity(prisma, {
        module: "Account",
        action: "Updated",
        details: `Account '${a.name}' updated`,
        doc: { type: "accounts", id },
      });
    } else {
      const created = await prisma.account.create({
        data: { ...data, balance: data.openingBalance },
      });
      await logActivity(prisma, {
        module: "Account",
        action: "Created",
        details: `Account '${a.name}' created`,
        doc: { type: "accounts", id: created.id },
      });
    }
  } catch {
    return { error: "Something went wrong saving the account." };
  }

  revalidatePath("/accounts");
  return { ok: true };
}

export async function deleteAccount(id: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  // Refuse rather than cascade. The payments on this account are attached to real
  // sales, purchases and expenses — deleting it would strand every one of them and
  // silently change what those documents say was paid.
  const [payments, expenses] = await Promise.all([
    prisma.payment.count({ where: { accountId: id } }),
    prisma.expense.count({ where: { accountId: id } }),
  ]);
  if (payments + expenses > 0) {
    return {
      error: `Cannot delete: money has moved through this account (${payments + expenses} entries). Its history is attached to real documents.`,
    };
  }

  const account = await prisma.account.findUnique({
    where: { id },
    select: { name: true },
  });

  try {
    await prisma.account.delete({ where: { id } });
    await logActivity(prisma, {
      module: "Account",
      action: "Deleted",
      details: `Account '${account?.name ?? `#${id}`}' deleted`,
    });
  } catch {
    return { error: "Failed to delete the account." };
  }
  revalidatePath("/accounts");
  return { ok: true };
}

// ---------- Deposit / withdraw ----------

const moveSchema = z.object({
  accountId: z.coerce.number().int().positive("Choose an account"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  date: z.string().min(1, "Date is required"),
  note: z.string().trim().max(255).optional(),
});

export async function depositOrWithdraw(
  direction: "IN" | "OUT",
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = moveSchema.safeParse({
    accountId: formData.get("accountId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const m = parsed.data;

  const account = await prisma.account.findUnique({
    where: { id: m.accountId },
    select: { balance: true, name: true },
  });
  if (!account) return { error: "Account not found." };

  // A till cannot hold less than nothing. Taking out more than is there is not a
  // withdrawal, it is a missing figure somewhere else.
  if (direction === "OUT" && round2(m.amount) > Number(account.balance) + 0.005) {
    return {
      error: `${account.name} holds ${Number(account.balance).toFixed(2)} — you cannot take out more than that.`,
    };
  }

  const actor = await activityActor();

  try {
    await prisma.$transaction(async (tx) => {
      await writeCashMove(tx, direction, {
        accountId: m.accountId,
        amount: m.amount,
        date: new Date(m.date),
        note: m.note,
      });
      await logActivity(tx, {
        module: "Account",
        action: "Created",
        details: `${direction === "IN" ? "Deposit" : "Withdraw"} ${m.amount.toFixed(2)} — ${account.name}`,
        doc: { type: "accounts", id: m.accountId },
        actor,
      });
    });
  } catch {
    return { error: "Something went wrong recording that." };
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${m.accountId}`);
  return { ok: true };
}

// ---------- Transfer ----------

const transferSchema = z
  .object({
    fromAccountId: z.coerce.number().int().positive("Choose the account it leaves"),
    toAccountId: z.coerce.number().int().positive("Choose the account it lands in"),
    amount: z.coerce.number().positive("Amount must be greater than zero"),
    date: z.string().min(1, "Date is required"),
    note: z.string().trim().max(255).optional(),
  })
  .refine((t) => t.fromAccountId !== t.toAccountId, {
    message: "Pick two different accounts — money cannot be moved to where it already is.",
  });

export async function saveTransfer(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = transferSchema.safeParse({
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const t = parsed.data;

  const [from, to] = await Promise.all([
    prisma.account.findUnique({
      where: { id: t.fromAccountId },
      select: { name: true, balance: true },
    }),
    prisma.account.findUnique({ where: { id: t.toAccountId }, select: { name: true } }),
  ]);
  if (!from || !to) return { error: "Account not found." };

  if (round2(t.amount) > Number(from.balance) + 0.005) {
    return {
      error: `${from.name} holds ${Number(from.balance).toFixed(2)} — you cannot move more than that.`,
    };
  }

  const actor = await activityActor();

  try {
    await prisma.$transaction(async (tx) => {
      const amount = round2(t.amount);
      const date = new Date(t.date);

      const transfer = await tx.accountTransfer.create({
        data: {
          amount,
          date,
          note: t.note?.trim() || null,
          fromAccountId: t.fromAccountId,
          toAccountId: t.toAccountId,
        },
      });

      // Two legs, tied to the transfer. Never one row touching two accounts —
      // every screen that totals a column would have to know to read it twice,
      // and the first one that forgot would lose the money (§23.3).
      const note = `Transfer ${from.name} → ${to.name}`;
      const out = await writeCashMove(tx, "OUT", {
        accountId: t.fromAccountId,
        amount,
        date,
        note: t.note?.trim() || note,
      });
      const inn = await writeCashMove(tx, "IN", {
        accountId: t.toAccountId,
        amount,
        date,
        note: t.note?.trim() || note,
      });
      await tx.payment.updateMany({
        where: { id: { in: [out, inn] } },
        data: { transferId: transfer.id },
      });

      await logActivity(tx, {
        module: "Account",
        action: "Created",
        details: `Transfer ${amount.toFixed(2)} from ${from.name} to ${to.name}`,
        actor,
      });
    });
  } catch {
    return { error: "Something went wrong recording the transfer." };
  }

  revalidatePath("/accounts");
  return { ok: true };
}

export async function deleteTransfer(id: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const transfer = await prisma.accountTransfer.findUnique({
    where: { id },
    include: {
      payments: true,
      toAccount: { select: { name: true, balance: true } },
      fromAccount: { select: { name: true } },
    },
  });
  if (!transfer) return { error: "That transfer no longer exists." };

  // Undoing it takes the money back out of the account it landed in. If that has
  // since been spent, the money is not there to take back — refuse rather than
  // drive a balance negative.
  const amount = Number(transfer.amount);
  if (amount > Number(transfer.toAccount.balance) + 0.005) {
    return {
      error: `${transfer.toAccount.name} now holds only ${Number(transfer.toAccount.balance).toFixed(2)} — the transferred money has been spent, so this cannot be undone.`,
    };
  }

  const actor = await activityActor();

  try {
    await prisma.$transaction(async (tx) => {
      // Reverse both legs, each against its own account.
      for (const p of transfer.payments) {
        await reverseCashMove(tx, p.id);
      }
      await tx.accountTransfer.delete({ where: { id } });

      await logActivity(tx, {
        module: "Account",
        action: "Deleted",
        details: `Transfer ${amount.toFixed(2)} from ${transfer.fromAccount.name} to ${transfer.toAccount.name} undone`,
        actor,
      });
    });
  } catch {
    return { error: "Failed to undo the transfer." };
  }

  revalidatePath("/accounts");
  return { ok: true };
}

/** Undo a deposit or a withdrawal. */
export async function deleteCashMove(paymentId: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const p = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      direction: true,
      amount: true,
      accountId: true,
      transferId: true,
      saleId: true,
      purchaseId: true,
      expenseId: true,
      contactId: true,
      account: { select: { name: true, balance: true } },
    },
  });
  if (!p || !p.accountId) return { error: "That entry no longer exists." };

  // Only a bare deposit/withdrawal can be undone here. Anything attached to a
  // document is owned by that document — undoing it from this screen would leave
  // the sale or expense claiming a payment that no longer exists.
  if (p.transferId) return { error: "That is part of a transfer — undo the transfer itself." };
  if (p.saleId || p.purchaseId || p.expenseId || p.contactId) {
    return { error: "That payment belongs to a document — undo it from there." };
  }

  const amount = Number(p.amount);
  if (p.direction === "IN" && amount > Number(p.account?.balance ?? 0) + 0.005) {
    return {
      error: `${p.account?.name} now holds only ${Number(p.account?.balance ?? 0).toFixed(2)} — that money has been spent, so the deposit cannot be undone.`,
    };
  }

  const actor = await activityActor();

  try {
    await prisma.$transaction(async (tx) => {
      await reverseCashMove(tx, p.id);

      await logActivity(tx, {
        module: "Account",
        action: "Deleted",
        details: `${p.direction === "IN" ? "Deposit" : "Withdrawal"} ${amount.toFixed(2)} — ${p.account?.name} undone`,
        actor,
      });
    });
  } catch {
    return { error: "Failed to undo that." };
  }

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${p.accountId}`);
  return { ok: true };
}
