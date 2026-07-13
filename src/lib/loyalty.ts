/**
 * Loyalty points. ONE place, because the POS screen and the server both have to
 * arrive at the same number (BLUEPRINT §15).
 *
 * The earn rule is a REPEATING THRESHOLD, not a rate — this is the thing the
 * reference shop's own data proved, and a linear rate reproduces none of their
 * invoices:
 *
 *     points = floor(bill / earnAmount) × earnPoints        (when repeating)
 *     points = bill >= earnAmount ? earnPoints : 0          (when not)
 *
 *     640 → floor(640/100) × 10 = 60   ✓ (their invoice says 60)
 *     740 → floor(740/100) × 10 = 70   ✓ (their invoice says 70)
 *
 * A point is worth `pointValue` when spent (0.10 → 100 points = 10.00), so the
 * default scheme returns 1% of the bill. A rate of "1 point per 10 taka worth
 * 1 taka each" — which is what we nearly shipped — would have been 10%.
 */

import { round2 } from "./costing";

export type LoyaltySettings = {
  loyaltyEnabled: boolean;
  earnAmount: number;
  earnPoints: number;
  earnRepeating: boolean;
  pointValue: number;
  minRedeemPoints: number;
  maxRedeemPct: number;
};

/**
 * Points earned on a bill. `total` is what the customer ACTUALLY PAID — after every
 * discount — so a free issue (§16) earns nothing on its own, with no special case.
 * Always whole points, always rounded DOWN: the shop should never owe a fraction.
 */
export function pointsEarned(total: number, s: LoyaltySettings): number {
  if (!s.loyaltyEnabled) return 0;
  const amount = Number(s.earnAmount) || 0;
  const per = Number(s.earnPoints) || 0;
  if (amount <= 0 || per <= 0 || total < amount) return 0;

  const times = s.earnRepeating ? Math.floor(total / amount) : 1;
  return Math.floor(times * per);
}

/** What a number of points is worth in money. */
export function pointsValue(points: number, s: LoyaltySettings): number {
  return round2(Math.max(0, points) * (Number(s.pointValue) || 0));
}

/** How many points it takes to cover an amount of money (rounded up — no free change). */
export function pointsForValue(amount: number, s: LoyaltySettings): number {
  const v = Number(s.pointValue) || 0;
  if (v <= 0) return 0;
  return Math.ceil(amount / v);
}

export type RedeemLimit = {
  /** The most points that may actually be spent on this bill. */
  maxPoints: number;
  /** What those points are worth. */
  maxValue: number;
  /** Why redemption is unavailable, if it is. */
  blocked: string | null;
};

/**
 * The two limits on spending points, both settled with the user (§15.4) and both
 * enforced on the SERVER — a cap the browser could talk around is not a cap.
 *
 *   1. a minimum balance before points may be spent at all, and
 *   2. a cap on the share of any one bill that points may cover.
 */
export function redeemLimit(
  balance: number,
  billTotal: number,
  s: LoyaltySettings,
): RedeemLimit {
  const none = { maxPoints: 0, maxValue: 0 };

  if (!s.loyaltyEnabled) return { ...none, blocked: "Loyalty points are switched off." };
  if (balance <= 0) return { ...none, blocked: "No points to spend." };
  if (balance < s.minRedeemPoints) {
    return {
      ...none,
      blocked: `${s.minRedeemPoints} points needed before they can be spent — this customer has ${balance}.`,
    };
  }
  if (billTotal <= 0) return { ...none, blocked: "Nothing to pay." };

  // Points may cover at most this share of the bill, so every sale still takes
  // real money. Whatever the cap allows, we can never spend more than they hold.
  const capValue = round2((billTotal * Math.max(0, Math.min(100, s.maxRedeemPct))) / 100);
  const heldValue = pointsValue(balance, s);
  const maxValue = round2(Math.min(capValue, heldValue));

  // Convert back to whole points, and never hand out more value than the cap.
  let maxPoints = Math.min(balance, pointsForValue(maxValue, s));
  while (maxPoints > 0 && pointsValue(maxPoints, s) > maxValue + 0.0001) maxPoints--;

  if (maxPoints <= 0) return { ...none, blocked: "These points are worth less than 0.01." };
  return { maxPoints, maxValue: pointsValue(maxPoints, s), blocked: null };
}

/**
 * Points to claw back when goods go back (§15.5). Proportional to what was actually
 * credited — the same `paidRatio` idea returns and exchanges already use.
 *
 * Buy → earn → return → keep the points would be free money, repeatable forever.
 * This can drive a balance negative if the customer already spent them; that is the
 * deliberate choice (the alternative just moves the hole to "spend first, then return").
 */
export function pointsToReverse(
  pointsEarnedOnSale: number,
  saleTotal: number,
  creditedNow: number,
): number {
  if (pointsEarnedOnSale <= 0 || saleTotal <= 0 || creditedNow <= 0) return 0;
  const share = Math.min(1, creditedNow / saleTotal);
  return Math.min(pointsEarnedOnSale, Math.round(pointsEarnedOnSale * share));
}
