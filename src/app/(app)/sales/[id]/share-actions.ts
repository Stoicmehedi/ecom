"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

export type ShareResult = { ok?: boolean; error?: string; token?: string | null };

/**
 * The public invoice link (BLUEPRINT §20.5).
 *
 * A shared invoice carries the customer's name, phone and what they bought, and it
 * is readable by **anyone holding the URL** — so:
 *
 *  - the token is 32 bytes of CSPRNG hex, not an id and not a hash of one. It cannot
 *    be guessed, incremented, or arrived at from the invoice number;
 *  - it is minted **on demand**, so a sale nobody shared has no public face at all;
 *  - it can be **revoked**, because "I shouldn't have sent that" is a thing people say.
 */
export async function createShareLink(saleId: number): Promise<ShareResult> {
  const session = await auth();
  if (!hasPermission(session, "sales.view")) {
    return { error: "You do not have permission to share this invoice." };
  }

  const sale = await prisma.sale.findUnique({
    where: { id: saleId },
    select: { publicToken: true, invoiceNo: true },
  });
  if (!sale) return { error: "That sale no longer exists." };

  // Already shared → hand back the same link rather than orphaning the old one.
  if (sale.publicToken) return { ok: true, token: sale.publicToken };

  const token = randomBytes(32).toString("hex");
  await prisma.sale.update({ where: { id: saleId }, data: { publicToken: token } });

  await logActivity(prisma, {
    module: "Sale",
    action: "Updated",
    details: `Public link created for ${sale.invoiceNo}`,
    doc: { type: "sales", no: sale.invoiceNo, id: saleId },
  });

  revalidatePath(`/sales/${saleId}`);
  return { ok: true, token };
}

export async function revokeShareLink(saleId: number): Promise<ShareResult> {
  const session = await auth();
  if (!hasPermission(session, "sales.view")) {
    return { error: "You do not have permission to change this invoice." };
  }

  const sale = await prisma.sale.update({
    where: { id: saleId },
    data: { publicToken: null },
  });

  await logActivity(prisma, {
    module: "Sale",
    action: "Updated",
    details: `Public link revoked for ${sale.invoiceNo}`,
    doc: { type: "sales", no: sale.invoiceNo, id: saleId },
  });

  revalidatePath(`/sales/${saleId}`);
  return { ok: true, token: null };
}
