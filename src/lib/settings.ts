/**
 * Shop-wide settings — exactly one row, typed (BLUEPRINT §17.1).
 *
 * A key/value bag would make every read a string parse and every typo a silent
 * `undefined`. This way a missing setting is impossible and the compiler knows
 * what exists.
 */

import { prisma } from "./prisma";
import type { LoyaltySettings } from "./loyalty";

export type ShopSettings = LoyaltySettings & {
  defaultAlertQty: number;
};

/** The settings row, created from the schema defaults the first time it is asked for. */
export async function getSettings(): Promise<ShopSettings> {
  const row = await prisma.shopSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  // Decimal → number at the boundary, so nothing downstream has to think about it.
  return {
    loyaltyEnabled: row.loyaltyEnabled,
    earnAmount: Number(row.earnAmount),
    earnPoints: row.earnPoints,
    earnRepeating: row.earnRepeating,
    pointValue: Number(row.pointValue),
    minRedeemPoints: row.minRedeemPoints,
    maxRedeemPct: row.maxRedeemPct,
    defaultAlertQty: row.defaultAlertQty,
  };
}
