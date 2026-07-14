/**
 * Document numbers, in one place (BLUEPRINT §26).
 *
 * Every document MPoS writes is `<prefix><number>`, where the number continues from
 * the last document of that kind. Six sequences share this one rule so they cannot
 * drift apart; five hold a fixed prefix, and the invoice's comes from Settings —
 * because the invoice is the only document a customer ever holds, and the only one a
 * shop must be able to line up with the books it is migrating off.
 *
 * Pure and Prisma-free, so the settings screen can preview the next number with the
 * very function the till calls to mint it.
 */

export type DocNoRule = {
  prefix: string;
  /** The number to begin at. The sequence never goes backwards past what is issued. */
  startNo: number;
  /** Zero-pad the number to at least this many digits. */
  pad: number;
};

/** Every existing MPoS document number is 5 digits wide (`INV-00001`). */
export const DOC_PAD = 5;

export const PURCHASE_NO: DocNoRule = { prefix: "PUR-", startNo: 1, pad: DOC_PAD };
export const PURCHASE_RETURN_NO: DocNoRule = { prefix: "PRT-", startNo: 1, pad: DOC_PAD };
export const SALE_RETURN_NO: DocNoRule = { prefix: "SRT-", startNo: 1, pad: DOC_PAD };
export const ADJUSTMENT_NO: DocNoRule = { prefix: "ADJ-", startNo: 1, pad: DOC_PAD };
export const EXCHANGE_NO: DocNoRule = { prefix: "EXC-", startNo: 1, pad: DOC_PAD };

export const DEFAULT_INVOICE_PREFIX = "INV-";
export const DEFAULT_INVOICE_START_NO = 1;

/**
 * The number a document number ends with.
 *
 * Read from the END, never with "strip every non-digit" — a prefix carrying a digit
 * (`IN2026-`) would otherwise fold into the number and blow the sequence up on the
 * next sale (§26.3). Which is why a prefix may not *end* in a digit: it would run
 * into the number with nothing to tell them apart.
 */
export function seqOf(docNo: string | null | undefined): number {
  const m = docNo?.match(/(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** The number the next document of this kind takes. */
export function nextDocNo(lastDocNo: string | null | undefined, rule: DocNoRule): string {
  // max(), so raising the start number jumps the sequence forward while a start number
  // below what is already issued is overtaken rather than re-issued. A duplicate is
  // impossible whatever is typed into Settings.
  const seq = Math.max(seqOf(lastDocNo) + 1, rule.startNo);
  return `${rule.prefix}${String(seq).padStart(rule.pad, "0")}`;
}

/** The invoice rule, from the shop's settings. */
export function invoiceRule(s: {
  invoicePrefix: string;
  invoiceStartNo: number;
}): DocNoRule {
  return { prefix: s.invoicePrefix, startNo: s.invoiceStartNo, pad: DOC_PAD };
}

/** Why this prefix cannot be used, or null if it can. Shared by the form and the server. */
export function invoicePrefixError(prefix: string): string | null {
  if (prefix.length > 10) return "Keep the prefix to 10 characters or fewer.";
  if (/\s/.test(prefix)) return "The prefix cannot contain spaces.";
  if (/\d$/.test(prefix)) {
    return "The prefix cannot end in a digit — it would run into the invoice number.";
  }
  if (!/^[A-Za-z0-9/_-]*$/.test(prefix)) {
    return "Use letters, digits, dashes, slashes or underscores in the prefix.";
  }
  return null;
}
