"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

export type SettingsResult = { ok?: boolean; error?: string };

const schema = z.object({
  loyaltyEnabled: z.boolean(),
  earnAmount: z.number().min(0, "Earn amount cannot be negative"),
  earnPoints: z.number().int().min(0, "Earn points cannot be negative"),
  earnRepeating: z.boolean(),
  pointValue: z.number().min(0, "A point cannot be worth less than nothing"),
  minRedeemPoints: z.number().int().min(0),
  maxRedeemPct: z.number().int().min(0).max(100, "A bill cannot be more than 100% paid in points"),
  defaultAlertQty: z.number().int().min(0),
  // Who the shop is (§20.1). A receipt headed with the name of our software tells
  // the customer nothing about the shop they just bought from.
  shopName: z.string().trim().min(1, "The shop needs a name — it goes on every receipt").max(80),
  shopAddress: z.string().trim().max(200).nullable().optional(),
  shopPhone: z.string().trim().max(40).nullable().optional(),
  shopEmail: z.string().trim().max(80).nullable().optional(),
  currencyWord: z.string().trim().min(1).max(20),
});

export type SettingsInput = z.input<typeof schema>;

export async function saveSettings(input: SettingsInput): Promise<SettingsResult> {
  // Settings are levers on every future sale — an earn rate is money. Gated on the
  // server, not just on the page (BLUEPRINT §17.3).
  const session = await auth();
  if (!hasPermission(session, "settings.manage")) {
    return { error: "You do not have permission to change settings." };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const s = parsed.data;

  // An earn rule of "0 points per 0" would silently earn nothing forever. If loyalty
  // is on, it has to actually mean something.
  if (s.loyaltyEnabled) {
    if (s.earnAmount <= 0) {
      return { error: "Set the amount that earns points (e.g. 100)." };
    }
    if (s.earnPoints <= 0) {
      return { error: "Set how many points that amount earns (e.g. 10)." };
    }
    if (s.pointValue <= 0) {
      return { error: "Set what one point is worth when spent (e.g. 0.10)." };
    }
  }

  const row = {
    ...s,
    shopAddress: s.shopAddress?.trim() || null,
    shopPhone: s.shopPhone?.trim() || null,
    shopEmail: s.shopEmail?.trim() || null,
  };

  await prisma.shopSetting.upsert({
    where: { id: 1 },
    update: row,
    create: { id: 1, ...row },
  });

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/inventory");
  revalidatePath("/sales");
  return { ok: true };
}
