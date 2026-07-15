"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navGroups, pinnedLinks } from "./nav-items";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type Crumb = { label: string; href?: string };

/**
 * A breadcrumb read straight off the nav map: the section a page lives in, then the
 * page. It orients without a second data source — the sidebar and the crumb can
 * never disagree about where you are.
 */
function crumbsFor(pathname: string): Crumb[] {
  const pinned = pinnedLinks.find(
    (p) => pathname === p.href || pathname.startsWith(p.href + "/"),
  );
  if (pinned) return [{ label: pinned.label }];

  let best: { group: string; label: string; href: string } | null = null;
  for (const g of navGroups) {
    for (const c of g.children) {
      if (pathname === c.href || pathname.startsWith(c.href + "/")) {
        if (!best || c.href.length > best.href.length) {
          best = { group: g.label, label: c.label, href: c.href };
        }
      }
    }
  }
  if (best) return [{ label: best.group }, { label: best.label, href: best.href }];
  return [{ label: "MPoS" }];
}

export function PageBreadcrumb() {
  const pathname = usePathname();
  const crumbs = crumbsFor(pathname);

  return (
    <Breadcrumb>
      <BreadcrumbList className="gap-1 sm:gap-1.5">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="contents">
              <BreadcrumbItem>
                {last || !c.href ? (
                  <BreadcrumbPage className="text-[13px] font-medium">
                    {c.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild className="text-[13px]">
                    <Link href={c.href}>{c.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator />}
            </span>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
