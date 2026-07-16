"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type Tab = { label: string; href: string; active: boolean };

/**
 * The one tab strip in the app — the catalogue's sub-nav and the reports' nav
 * are the same thing and are now the same component.
 *
 * On a narrow screen the strip **scrolls sideways** rather than wrapping into
 * stacked rows or pushing the page out from under itself (six catalogue tabs
 * used to make the whole page 500px wide on a 390px phone, so every table on it
 * looked cut off — the tabs were the cause, not the tables). It bleeds to the
 * screen edge on a phone so the swipe starts where the thumb is, and sits flush
 * with the page on a desktop, where nothing overflows anyway.
 */
export function TabStrip({ tabs, className }: { tabs: Tab[]; className?: string }) {
  return (
    <div
      className={cn(
        "no-print -mx-4 overflow-x-auto border-b px-4 lg:mx-0 lg:px-0",
        className,
      )}
    >
      <div className="flex w-max gap-1">
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={t.active ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              t.active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
