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
  /// Who the shop is — printed on every receipt and invoice (§20.1).
  shopName: string;
  shopAddress: string | null;
  shopPhone: string | null;
  shopEmail: string | null;
  currencyWord: string;
  /// How sale invoices are numbered (§26). The only document whose numbering is the shop's.
  invoicePrefix: string;
  invoiceStartNo: number;
  /// What prints on the receipt and the invoice (§27).
  showTime: boolean;
  showSizeColour: boolean;
  showSku: boolean;
  showPaymentDetails: boolean;
  showInWords: boolean;
  showSignatures: boolean;
  signatureLeft: string;
  signatureRight: string;
  footerNote: string | null;
  defaultPrint: "RECEIPT" | "A4";
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
    shopName: row.shopName,
    shopAddress: row.shopAddress,
    shopPhone: row.shopPhone,
    shopEmail: row.shopEmail,
    currencyWord: row.currencyWord,
    invoicePrefix: row.invoicePrefix,
    invoiceStartNo: row.invoiceStartNo,
    showTime: row.showTime,
    showSizeColour: row.showSizeColour,
    showSku: row.showSku,
    showPaymentDetails: row.showPaymentDetails,
    showInWords: row.showInWords,
    showSignatures: row.showSignatures,
    signatureLeft: row.signatureLeft,
    signatureRight: row.signatureRight,
    footerNote: row.footerNote,
    defaultPrint: row.defaultPrint,
  };
}
