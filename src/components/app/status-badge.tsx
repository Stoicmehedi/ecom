import { cn } from "@/lib/utils";

/**
 * A document's payment status as a quiet pill with a status dot (BLUEPRINT UI §).
 * One place decides what PAID / PARTIAL / DUE look like, so every list reads the
 * same — a badge that means the same thing must look the same everywhere.
 */
const tones: Record<string, { label: string; dot: string; box: string }> = {
  PAID: {
    label: "Paid",
    dot: "bg-primary",
    box: "border-primary/20 bg-primary/10 text-primary",
  },
  PARTIAL: {
    label: "Partial",
    dot: "bg-amber-500",
    box: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-500",
  },
  DUE: {
    label: "Unpaid",
    dot: "bg-destructive",
    box: "border-destructive/20 bg-destructive/10 text-destructive",
  },
};

export function StatusBadge({ status }: { status: string }) {
  const t = tones[status] ?? {
    label: status,
    dot: "bg-muted-foreground",
    box: "border-border bg-muted text-muted-foreground",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        t.box,
      )}
    >
      <span className={cn("size-1.5 rounded-full", t.dot)} />
      {t.label}
    </span>
  );
}
