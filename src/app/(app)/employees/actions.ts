"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requirePermission } from "@/lib/guard";
import { round2 } from "@/lib/costing";
import { monthLabel } from "@/lib/months";
import { postSalaryExpense } from "@/lib/expenses";

export type ActionResult = { ok?: boolean; error?: string; id?: number };

/**
 * Admin-only (BLUEPRINT §24.4). What the staff are paid is not a cashier's
 * business — the same reasoning as expenses (§18.8), and the gate is on the server
 * so it holds no matter what the browser sends.
 */
async function requireManage(): Promise<string | null> {
  return requirePermission("employees.manage");
}

// ---------- The employees themselves ----------

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  designation: z.string().trim().min(1, "Designation is required").max(100),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  address: z.string().trim().max(255).optional(),
  email: z.string().trim().max(150).optional(),
  nid: z.string().trim().max(60).optional(),
  joiningDate: z.string().min(1, "Joining date is required"),
  monthlySalary: z.coerce.number().min(0, "Salary cannot be negative"),
  isActive: z.boolean().default(true),
});

export async function saveEmployee(
  id: number | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = employeeSchema.safeParse({
    name: formData.get("name"),
    designation: formData.get("designation"),
    phone: formData.get("phone"),
    address: formData.get("address") || undefined,
    email: formData.get("email") || undefined,
    nid: formData.get("nid") || undefined,
    joiningDate: formData.get("joiningDate"),
    monthlySalary: formData.get("monthlySalary") || 0,
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const e = parsed.data;

  const data = {
    name: e.name,
    designation: e.designation,
    phone: e.phone,
    address: e.address || null,
    email: e.email || null,
    nid: e.nid || null,
    joiningDate: new Date(e.joiningDate),
    monthlySalary: round2(e.monthlySalary),
    isActive: e.isActive,
  };

  try {
    if (id) {
      await prisma.employee.update({ where: { id }, data });
    } else {
      const branch = await prisma.branch.findFirst({ select: { id: true } });
      await prisma.employee.create({ data: { ...data, branchId: branch?.id ?? null } });
    }
  } catch {
    return { error: "Something went wrong saving the employee." };
  }

  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteEmployee(id: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  // Refuse rather than cascade. Deleting someone who has been paid would strand the
  // salary expenses on the P&L — money spent, with nobody it was spent on. The shop
  // retires staff instead (one of the reference shop's four is Inactive).
  const paid = await prisma.salaryPayment.count({ where: { employeeId: id } });
  if (paid > 0) {
    return {
      error: `Cannot delete: ${paid} salary payment(s) have been made to this employee. Mark them inactive instead.`,
    };
  }

  try {
    await prisma.employee.delete({ where: { id } });
  } catch {
    return { error: "Failed to delete the employee." };
  }
  revalidatePath("/employees");
  return { ok: true };
}

// ---------- Paying wages ----------

const paySchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  date: z.string().min(1, "Date is required"),
  accountId: z.coerce.number().int().positive("Choose the account it comes from"),
  note: z.string().trim().max(255).optional(),
});

/**
 * One document covers both of the reference app's forms (§24.3): an **advance** is
 * a payment stamped with a month that has not arrived yet, and a **partial** payment
 * is simply a smaller amount. There is no second concept to keep in step.
 */
export async function paySalary(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const parsed = paySchema.safeParse({
    employeeId: formData.get("employeeId"),
    month: formData.get("month"),
    year: formData.get("year"),
    amount: formData.get("amount"),
    date: formData.get("date"),
    accountId: formData.get("accountId"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  const [employee, account] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: p.employeeId },
      select: { name: true, monthlySalary: true, branchId: true },
    }),
    prisma.account.findUnique({
      where: { id: p.accountId },
      select: { name: true, balance: true },
    }),
  ]);
  if (!employee) return { error: "Employee not found." };
  if (!account) return { error: "Account not found." };

  const amount = round2(p.amount);

  // The drawer cannot pay out what it does not hold.
  if (amount > Number(account.balance) + 0.005) {
    return {
      error: `${account.name} holds ${Number(account.balance).toFixed(2)} — there is not enough to pay this.`,
    };
  }

  // A month's wages cannot be overpaid: the total paid FOR a month is capped at the
  // monthly salary. Without this, a second click quietly pays someone twice.
  const already = await prisma.salaryPayment.aggregate({
    where: { employeeId: p.employeeId, month: p.month, year: p.year },
    _sum: { amount: true },
  });
  const paidSoFar = round2(Number(already._sum.amount ?? 0));
  const salary = round2(Number(employee.monthlySalary));
  const left = round2(salary - paidSoFar);

  if (amount > left + 0.005) {
    return {
      error:
        left <= 0
          ? `${employee.name} has already been paid in full for ${monthLabel(p.month, p.year)}.`
          : `Only ${left.toFixed(2)} is left of ${employee.name}'s ${monthLabel(p.month, p.year)} salary.`,
    };
  }

  try {
    const session = await auth();
    const userId = session?.user?.id ? Number(session.user.id) : null;
    const date = new Date(p.date);

    await prisma.$transaction(async (tx) => {
      const payment = await tx.salaryPayment.create({
        data: {
          employeeId: p.employeeId,
          month: p.month,
          year: p.year,
          amount,
          date,
          accountId: p.accountId,
          note: p.note?.trim() || null,
          paidById: userId,
        },
      });

      // Wages are an ordinary expense (§24.2) — that is what puts them in the P&L
      // with no second code path that could forget them.
      const expenseId = await postSalaryExpense(tx, {
        salaryPaymentId: payment.id,
        employeeName: employee.name,
        monthLabel: monthLabel(p.month, p.year),
        amount,
        accountId: p.accountId,
        date,
        branchId: employee.branchId,
      });

      // And the money actually leaves the drawer — as a payment against that expense,
      // so the account statement names it ("Expense · Salary") and, because the FKs
      // cascade both ways, undoing the wage payment takes the expense and this row
      // with it. Nothing has to be found again by matching on a note.
      await tx.payment.create({
        data: {
          direction: "OUT",
          amount,
          method: "CASH",
          accountId: p.accountId,
          expenseId,
          date,
          note: `${employee.name} — ${monthLabel(p.month, p.year)} salary`,
        },
      });
      await tx.account.update({
        where: { id: p.accountId },
        data: { balance: { decrement: amount } },
      });
    });
  } catch {
    return { error: "Something went wrong recording the payment." };
  }

  revalidatePath("/employees");
  revalidatePath("/expenses");
  revalidatePath("/accounts");
  revalidatePath("/reports");
  return { ok: true };
}

export async function deleteSalaryPayment(id: number): Promise<ActionResult> {
  const denied = await requireManage();
  if (denied) return { error: denied };

  const payment = await prisma.salaryPayment.findUnique({
    where: { id },
    select: {
      id: true,
      // Every money row this payment caused hangs off its expense, so undoing it is
      // one delete plus one balance correction — no re-derivation, nothing to miss.
      expenses: { select: { payments: { select: { accountId: true, amount: true } } } },
    },
  });
  if (!payment) return { error: "That payment no longer exists." };

  try {
    await prisma.$transaction(async (tx) => {
      // Put the money back where it came from, before the rows that say where that
      // was disappear.
      for (const expense of payment.expenses) {
        for (const row of expense.payments) {
          if (!row.accountId) continue;
          await tx.account.update({
            where: { id: row.accountId },
            data: { balance: { increment: Number(row.amount) } },
          });
        }
      }

      // The Salary expense — and the OUT payment hanging off it — cascade away with
      // the wage payment (both FKs are onDelete: Cascade).
      await tx.salaryPayment.delete({ where: { id } });
    });
  } catch {
    return { error: "Failed to undo the payment." };
  }

  revalidatePath("/employees");
  revalidatePath("/expenses");
  revalidatePath("/accounts");
  revalidatePath("/reports");
  return { ok: true };
}
