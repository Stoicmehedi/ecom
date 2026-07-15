"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { MposLogo } from "./mpos-logo";
import { visibleNav, type NavGroup, type PinnedLink } from "./nav-items";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export function SidebarContent({
  permissions,
  onNavigate,
}: {
  permissions: string[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  // Filtered here, not on the server: a NavItem carries its Lucide icon, which is a
  // function — and a function cannot cross the server→client boundary.
  const { pinned, groups } = visibleNav(permissions);

  // One route is "active": the visible destination whose href is the longest prefix
  // of the current path. Longest-prefix wins, so /reports/sales lights "Sales", not
  // the /reports "Overview" above it.
  const hrefs = [
    ...pinned.map((p) => p.href),
    ...groups.flatMap((g) => g.children.map((c) => c.href)),
  ];
  const active =
    hrefs
      .filter((h) => pathname === h || pathname.startsWith(h + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/dashboard" onClick={onNavigate}>
          <MposLogo />
        </Link>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        <div className="space-y-0.5">
          {pinned.map((link) => (
            <PinnedRow
              key={link.href}
              link={link}
              active={active === link.href}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        {groups.map((group) => (
          <Group
            key={group.label}
            group={group}
            active={active}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[11px] text-muted-foreground">MPoS · Single-store edition</p>
      </div>
    </div>
  );
}

function PinnedRow({
  link,
  active,
  onNavigate,
}: {
  link: PinnedLink;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {link.label}
    </Link>
  );
}

function Group({
  group,
  active,
  onNavigate,
}: {
  group: NavGroup;
  active: string | null;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const hasActive = group.children.some((c) => c.href === active);

  return (
    <Collapsible defaultOpen={hasActive} className="group/nav">
      <CollapsibleTrigger
        className={cn(
          "flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] font-medium transition-colors",
          "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronRight className="size-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-200 group-data-[state=open]/nav:rotate-90" />
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        {/* A hairline guide runs down the children, so the section reads as one unit. */}
        <ul className="mt-0.5 ml-[1.375rem] space-y-0.5 border-l border-sidebar-border pl-2">
          {group.children.map((child) => {
            const isActive = child.href === active;
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex h-7 items-center rounded-md px-2.5 text-[13px] transition-colors",
                    isActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
