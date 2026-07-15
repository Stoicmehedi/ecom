"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { round2 } from "@/lib/costing";
import { requirePermission } from "@/lib/guard";
import { logActivity, activityActor } from "@/lib/activity";

export type ActionState = { ok?: boolean; error?: string };

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  phone: z.string().trim().min(1, "Phone is required").max(30),
  businessName: z.string().trim().max(150).optional(),
  email: z.string().trim().max(150).optional(),
  address: z.string().trim().max(255).optional(),
  note: z.string().trim().max(500).optional(),
  openingBalance: z.coerce.number().min(0).default(0),
});

function parse(formData: FormData) {
  return schema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone"),
    businessName: formData.get("businessName") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
    note: formData.get("note") || undefined,
    openingBalance: formData.get("openingBalance") || 0,
  });
}

export async function saveSupplier(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await requirePermission("contacts.manage");
  if (denied) return { error: denied };

  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;

  const email = s.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email is not valid." };
  }

  const data = {
    name: s.name,
    phone: s.phone,
    businessName: s.businessName || null,
    email,
    address: s.address || null,
    note: s.note || null,
    openingBalance: round2(s.openingBalance),
  };

  try {
    if (id) {
      // Opening balance is part of what they're owed — shift the running due by the delta.
      const existing = await prisma.contact.findUnique({
        where: { id },
        select: { openingBalance: true, dueBalance: true },
      });
      if (!existing) return { error: "Supplier not found." };
      const delta = data.openingBalance - Number(existing.openingBalance);
      await prisma.contact.update({
        where: { id },
        data: { ...data, dueBalance: round2(Number(existing.dueBalance) + delta) },
      });
      await logActivity(prisma, {
        module: "Supplier",
        action: "Updated",
        details: `Supplier '${data.name}' updated`,
        doc: { type: "suppliers", id },
      });
    } else {
      const created = await prisma.contact.create({
        data: { ...data, type: "SUPPLIER", dueBalance: data.openingBalance },
      });
      await logActivity(prisma, {
        module: "Supplier",
        action: "Created",
        details: `Supplier '${data.name}' created`,
        doc: { type: "suppliers", id: created.id },
      });
    }
  } catch {
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/suppliers");
  revalidatePath("/purchases");
  return { ok: true };
}

export async function deleteSupplier(id: number): Promise<ActionState> {
  const denied = await requirePermission("contacts.delete");
  if (denied) return { error: denied };

  const purchases = await prisma.purchase.count({ where: { supplierId: id } });
  if (purchases > 0) {
    return { error: "Cannot delete: this supplier has purchase history." };
  }
  try {
    const deleted = await prisma.contact.delete({ where: { id } });
    await logActivity(prisma, {
      module: "Supplier",
      action: "Deleted",
      details: `Supplier '${deleted.name}' deleted`,
    });
  } catch {
    return { error: "Failed to delete supplier." };
  }
  revalidatePath("/suppliers");
  return { ok: true };
}

/** Quick-add from the purchase form's supplier picker. */
export async function quickAddSupplier(
  name: string,
  phone: string,
): Promise<{ id?: number; error?: string }> {
  const denied = await requirePermission("contacts.manage");
  if (denied) return { error: denied };

  const n = name.trim();
  const p = phone.trim();
  if (!n) return { error: "Name is required" };
  if (!p) return { error: "Phone is required" };
  try {
    const c = await prisma.contact.create({
      data: { type: "SUPPLIER", name: n, phone: p },
    });
    await logActivity(prisma, {
      module: "Supplier",
      action: "Created",
      details: `Supplier '${c.name}' created`,
      doc: { type: "suppliers", id: c.id },
    });
    revalidatePath("/suppliers");
    return { id: c.id };
  } catch {
    return { error: "Failed to add supplier" };
  }
}

const paySchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  method: z.string().trim().min(1),
  accountId: z.coerce.number().int().optional(),
  note: z.string().trim().max(255).optional(),
});

/** Pay down a supplier's outstanding balance (not tied to one purchase). */
export async function paySupplierDue(
  supplierId: number,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const denied = await requirePermission("contacts.due");
  if (denied) return { error: denied };

  const parsed = paySchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    accountId: formData.get("accountId") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { amount, method, accountId, note } = parsed.data;

  const supplier = await prisma.contact.findUnique({
    where: { id: supplierId },
    select: { dueBalance: true, name: true },
  });
  if (!supplier) return { error: "Supplier not found." };

  const due = Number(supplier.dueBalance);
  if (amount > due + 0.005) {
    return { error: `Amount exceeds the outstanding due (${due.toFixed(2)}).` };
  }

  const actor = await activityActor();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          direction: "OUT",
          amount: round2(amount),
          method,
          accountId: accountId ?? null,
          contactId: supplierId,
          note: note || "Supplier due payment",
        },
      });
      await tx.contact.update({
        where: { id: supplierId },
        data: { dueBalance: { decrement: round2(amount) } },
      });
      if (accountId) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { decrement: round2(amount) } },
        });
      }

      await logActivity(tx, {
        module: "Due Payment",
        action: "Created",
        details: `Paid ${round2(amount).toFixed(2)} to '${supplier.name}'`,
        doc: { type: "suppliers", id: supplierId },
        actor,
      });
    });
  } catch {
    return { error: "Failed to record the payment." };
  }

  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${supplierId}`);
  return { ok: true };
}
