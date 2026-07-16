"use client";

import { usePathname } from "next/navigation";
import { TabStrip } from "./tab-strip";

const tabs = [
  { label: "Products", href: "/products" },
  { label: "Categories", href: "/categories" },
  { label: "Brands", href: "/brands" },
  { label: "Units", href: "/units" },
  { label: "Attributes & colours", href: "/attributes" },
  { label: "Labels", href: "/labels" },
];

export function CatalogTabs() {
  const pathname = usePathname();
  return (
    <TabStrip
      tabs={tabs.map((t) => ({
        ...t,
        active: pathname === t.href || pathname.startsWith(t.href + "/"),
      }))}
    />
  );
}
