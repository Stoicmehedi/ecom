"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MposLogo } from "./mpos-logo";
import { visibleNav } from "./nav-items";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The collapsed sidebar: a slim icon rail rather than nothing at all, so the
 * whole nav is still one click away when it is tucked in. Pinned links get a
 * hover tooltip; a group's icon opens its children in a flyout to the right,
 * because a group has nowhere to show its label inline at this width.
 */
export function SidebarRail({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  const { pinned, groups } = visibleNav(permissions);

  // Same longest-prefix rule the full sidebar uses, so both agree on what's active.
  const hrefs = [
    ...pinned.map((p) => p.href),
    ...groups.flatMap((g) => g.children.map((c) => c.href)),
  ];
  const active =
    hrefs
      .filter((h) => pathname === h || pathname.startsWith(h + "/"))
      .sort((a, b) => b.length - a.length)[0] ?? null;

  const iconBtn =
    "flex size-9 items-center justify-center rounded-md transition-colors";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full w-14 flex-col items-center bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 w-full items-center justify-center border-b border-sidebar-border">
          <Link href="/dashboard" aria-label="Dashboard">
            <MposLogo showWordmark={false} />
          </Link>
        </div>

        <nav className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto py-3">
          {pinned.map((link) => {
            const Icon = link.icon;
            const on = active === link.href;
            return (
              <Tooltip key={link.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={link.href}
                    aria-label={link.label}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      iconBtn,
                      on
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-[1.15rem]" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{link.label}</TooltipContent>
              </Tooltip>
            );
          })}

          {pinned.length > 0 && groups.length > 0 && (
            <div className="my-1 h-px w-6 bg-sidebar-border" />
          )}

          {groups.map((group) => {
            const Icon = group.icon;
            const on = group.children.some((c) => c.href === active);
            return (
              <DropdownMenu key={group.label}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={group.label}
                    className={cn(
                      iconBtn,
                      "outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "bg-primary/10 text-primary"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-[1.15rem]" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="min-w-44">
                  <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                  {group.children.map((child) => {
                    const childOn = child.href === active;
                    return (
                      <DropdownMenuItem key={child.href} asChild>
                        <Link
                          href={child.href}
                          className={cn(childOn && "font-medium text-primary")}
                        >
                          {child.label}
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </nav>
      </div>
    </TooltipProvider>
  );
}
