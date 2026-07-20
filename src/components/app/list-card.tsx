import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The phone view of a list row (BLUEPRINT §30). The wide tables on these pages
 * carry 8–11 columns; below `sm` each row renders as one of these cards instead,
 * so no figure hides off the right edge behind a horizontal scroll. The desktop
 * `<table>` is unchanged and simply switches to `hidden sm:block`.
 */

export type CardField = {
  label: string;
  value: React.ReactNode;
  /** Extra classes for the value (e.g. a red due). */
  className?: string;
};

export function ListCard({
  title,
  href,
  media,
  subtitle,
  badge,
  fields,
  actions,
  dimmed,
}: {
  title: React.ReactNode;
  href?: string;
  /** Optional leading thumbnail (e.g. a product photo). */
  media?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Top-right slot — a status badge, usually. */
  badge?: React.ReactNode;
  fields: CardField[];
  /** Bottom row — the same row-action control the table uses. */
  actions?: React.ReactNode;
  /** Faded, for inactive records. */
  dimmed?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/70 bg-card p-3.5 shadow-sm",
        dimmed && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {media}
          <div className="min-w-0">
            <div className="truncate font-medium">
              {href ? (
                <Link href={href} className="hover:text-primary hover:underline">
                  {title}
                </Link>
              ) : (
                title
              )}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
        {badge && <div className="shrink-0">{badge}</div>}
      </div>

      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {fields.map((f, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-muted-foreground">{f.label}</dt>
            <dd className={cn("text-[13px] tabular-nums", f.className)}>{f.value}</dd>
          </div>
        ))}
      </dl>

      {actions && (
        <div className="mt-2.5 flex justify-end border-t border-border/60 pt-2.5">
          {actions}
        </div>
      )}
    </div>
  );
}

/** Empty-state card for a phone list. */
export function ListCardEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/70 bg-card p-6 text-center text-sm text-muted-foreground shadow-sm sm:hidden">
      {children}
    </div>
  );
}
