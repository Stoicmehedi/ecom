import type { Decimal } from "@/generated/prisma/internal/prismaNamespace";

/** Prisma Decimal | number | string → number. */
export function num(v: Decimal | number | string | null | undefined): number {
  return v == null ? 0 : Number(v);
}

/** Money for display. No currency symbol — the app is single-currency. */
export function money(v: Decimal | number | string | null | undefined): string {
  return num(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Quantity for display — trims trailing zeros (3 → "3", 1.5 → "1.5"). */
export function qty(v: Decimal | number | string | null | undefined): string {
  return String(Number(num(v).toFixed(3)));
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
