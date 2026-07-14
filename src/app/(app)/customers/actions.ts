"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { settleAgainstInvoices } from "@/lib/settle";
import { revalidatePath } from "next/cache";
import { round2 } from "@/lib/costing";
import { isUniqueError, isFkError } from "@/lib/db-error";

export type ActionState = { ok?: boolean; error?: string };

const schema = z.object({
  phone: z.string().trim().min(1, "Phone is required").max(30),
  name: z.string().trim().max(150).optional(),
  businessName: z.string().trim().max(150).optional(),
  email: z.string().trim().max(150).optional(),
  address: z.string().trim().max(255).optional(),
  note: z.string().trim().max(500).optional(),
  customerGroupId: z.coerce.number().int().optional(),
  openingBalance: z.coerce.number().min(0).default(0),
  loyaltyPoints: z.coerce.number().int().min(0).default(0),
});

export async function saveCustomer(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const groupRaw = formData.get("customerGroupId");
  const parsed = schema.safeParse({
    phone: formData.get("phone"),
    name: formData.get("name") || undefined,
    businessName: formData.get("businessName") || undefined,
    email: formData.get("email") || undefined,
    address: formData.get("address") || undefined,
    note: formData.get("note") || undefined,
    customerGroupId: groupRaw && groupRaw !== "none" ? groupRaw : undefined,
    openingBalance: formData.get("openingBalance") || 0,
    loyaltyPoints: formData.get("loyaltyPoints") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const c = parsed.data;

  const email = c.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Email is not valid." };
  }

  const data = {
    // Phone is the identity key; a nameless customer still needs a label.
    name: c.name?.trim() || `Customer ${c.phone}`,
    phone: c.phone,
    businessName: c.businessName || null,
    email,
    address: c.address || null,
    note: c.note || null,
    customerGroupId: c.customerGroupId ?? null,
    openingBalance: round2(c.openingBalance),
    loyaltyPoints: c.loyaltyPoints,
  };

  try {
    if (id) {
      const existing = await prisma.contact.findUnique({
        where: { id },
        select: { openingBalance: true, dueBalance: true, isWalkIn: true },
      });
      if (!existing) return { error: "Customer not found." };
      // The opening balance is part of what they owe — shift the running due by the delta.
      const delta = data.openingBalance - Number(existing.openingBalance);
      await prisma.contact.update({
        where: { id },
        data: { ...data, dueBalance: round2(Number(existing.dueBalance) + delta) },
      });
    } else {
      await prisma.contact.create({
        data: { ...data, type: "CUSTOMER", dueBalance: data.openingBalance },
      });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "That customer already exists." };
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomer(id: number): Promise<ActionState> {
  const customer = await prisma.contact.findUnique({
    where: { id },
    select: { isWalkIn: true },
  });
  if (!customer) return { error: "Customer not found." };
  if (customer.isWalkIn) {
    return { error: "The walk-in customer is used by POS and cannot be deleted." };
  }

  const sales = await prisma.sale.count({ where: { customerId: id } });
  if (sales > 0) {
    return { error: "Cannot delete: this customer has sales history." };
  }

  try {
    await prisma.contact.delete({ where: { id } });
  } catch {
    return { error: "Failed to delete customer." };
  }
  revalidatePath("/customers");
  return { ok: true };
}

/** Quick-add from the POS customer picker. */
export async function quickAddCustomer(
  phone: string,
  name: string,
): Promise<{ id?: number; error?: string }> {
  const p = phone.trim();
  if (!p) return { error: "Phone is required" };
  try {
    const c = await prisma.contact.create({
      data: {
        type: "CUSTOMER",
        phone: p,
        name: name.trim() || `Customer ${p}`,
      },
    });
    revalidatePath("/customers");
    return { id: c.id };
  } catch {
    return { error: "Failed to add customer" };
  }
}

const receiveSchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  method: z.string().trim().min(1),
  accountId: z.coerce.number().int().optional(),
  note: z.string().trim().max(255).optional(),
});

/** Collect money a customer owes us (not tied to one sale). */
export async function receiveCustomerDue(
  customerId: number,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = receiveSchema.safeParse({
    amount: formData.get("amount"),
    method: formData.get("method"),
    accountId: formData.get("accountId") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { amount, method, accountId, note } = parsed.data;

  const customer = await prisma.contact.findUnique({
    where: { id: customerId },
    select: { dueBalance: true },
  });
  if (!customer) return { error: "Customer not found." };

  const due = Number(customer.dueBalance);
  if (amount > due + 0.005) {
    return { error: `Amount exceeds the outstanding due (${due.toFixed(2)}).` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          direction: "IN",
          amount: round2(amount),
          method,
          accountId: accountId ?? null,
          contactId: customerId,
          note: note || "Customer due received",
        },
      });

      // The money lands on their open invoices, oldest first (BLUEPRINT §22.3).
      // Without this the account went to zero while the invoices still read "due",
      // and the Dues report — which is built from invoices — chased a customer who
      // had already paid.
      await settleAgainstInvoices(tx, {
        contactId: customerId,
        amount: round2(amount),
        kind: "PAYMENT",
        ref: { paymentId: payment.id },
        date: payment.date,
      });

      await tx.contact.update({
        where: { id: customerId },
        data: { dueBalance: { decrement: round2(amount) } },
      });
      if (accountId) {
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: round2(amount) } },
        });
      }
    });
  } catch {
    return { error: "Failed to record the payment." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

// ---------- Customer groups (name + default discount %) ----------

const groupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  discount: z.coerce
    .number()
    .min(0, "Discount cannot be negative")
    .max(100, "Discount cannot exceed 100%")
    .default(0),
});

export async function saveCustomerGroup(
  id: number | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = groupSchema.safeParse({
    name: formData.get("name"),
    discount: formData.get("discount") || 0,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  try {
    if (id) {
      await prisma.customerGroup.update({ where: { id }, data: parsed.data });
    } else {
      await prisma.customerGroup.create({ data: parsed.data });
    }
  } catch (e) {
    if (isUniqueError(e)) return { error: "A group with this name already exists." };
    return { error: "Something went wrong. Please try again." };
  }
  revalidatePath("/customer-groups");
  revalidatePath("/customers");
  return { ok: true };
}

export async function deleteCustomerGroup(id: number): Promise<ActionState> {
  // The FK is ON DELETE SET NULL, so deleting would silently un-group these
  // customers rather than fail. Refuse instead of quietly changing their data.
  const inUse = await prisma.contact.count({ where: { customerGroupId: id } });
  if (inUse > 0) {
    return {
      error: `Cannot delete: ${inUse} customer${inUse === 1 ? " is" : "s are"} in this group.`,
    };
  }

  try {
    await prisma.customerGroup.delete({ where: { id } });
  } catch (e) {
    if (isFkError(e)) return { error: "Cannot delete: this group is still in use." };
    return { error: "Failed to delete group." };
  }
  revalidatePath("/customer-groups");
  return { ok: true };
}
