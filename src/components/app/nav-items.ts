import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Boxes,
  ScanBarcode,
  Receipt,
  Users,
  BarChart3,
  Wallet,
  type LucideIcon,
  ShieldCheck,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

/**
 * The sidebar, grouped the way a shopkeeper thinks (BLUEPRINT UI §). Two pinned
 * links sit flat at the top — the Dashboard and the till, the screens opened all
 * day — and everything else lives in collapsible sections.
 *
 * A leaf is hidden unless the signed-in role holds its `permission` (absent =
 * everyone). A GROUP is derived from its visible children: a section whose every
 * child is hidden does not render at all, so a cashier never sees a "Money" or
 * "Admin" heading that opens onto nothing — the "door that only bounces you"
 * problem §25 fixed, kept fixed.
 */

export type NavLeaf = {
  label: string;
  href: string;
  permission?: PermissionKey;
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  children: NavLeaf[];
};

export type PinnedLink = {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: PermissionKey;
};

/** Always flat, always first. */
export const pinnedLinks: PinnedLink[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "POS", href: "/pos", icon: ScanBarcode, permission: "pos.access" },
];

export const navGroups: NavGroup[] = [
  {
    label: "Catalogue",
    icon: Package,
    children: [
      { label: "Products", href: "/products", permission: "products.view" },
      { label: "Categories", href: "/categories", permission: "products.masters" },
      { label: "Brands", href: "/brands", permission: "products.masters" },
      { label: "Units", href: "/units", permission: "products.masters" },
      { label: "Attributes & colours", href: "/attributes", permission: "products.masters" },
      { label: "Labels", href: "/labels", permission: "products.manage" },
    ],
  },
  {
    label: "Buying",
    icon: ShoppingBag,
    children: [
      { label: "Purchases", href: "/purchases", permission: "purchases.view" },
      { label: "Purchase returns", href: "/purchase-returns", permission: "purchases.return" },
      { label: "Suppliers", href: "/suppliers", permission: "contacts.view" },
    ],
  },
  {
    label: "Selling",
    icon: Receipt,
    children: [
      { label: "Sales", href: "/sales", permission: "sales.view" },
      { label: "Sale returns", href: "/sale-returns", permission: "sales.return" },
      { label: "Exchanges", href: "/exchanges", permission: "sales.view" },
    ],
  },
  {
    label: "Stock",
    icon: Boxes,
    children: [
      { label: "Inventory", href: "/inventory", permission: "stock.view" },
      { label: "Adjustments", href: "/adjustments", permission: "stock.adjust" },
    ],
  },
  {
    label: "Customers",
    icon: Users,
    children: [
      { label: "Customers", href: "/customers", permission: "contacts.view" },
      { label: "Customer groups", href: "/customer-groups", permission: "contacts.manage" },
    ],
  },
  {
    label: "Money",
    icon: Wallet,
    children: [
      { label: "Accounts", href: "/accounts", permission: "accounts.manage" },
      { label: "Expenses", href: "/expenses", permission: "expenses.manage" },
      { label: "Employees & salary", href: "/employees", permission: "employees.manage" },
    ],
  },
  {
    label: "Reports",
    icon: BarChart3,
    children: [
      { label: "Overview", href: "/reports", permission: "reports.view" },
      { label: "Sales", href: "/reports/sales", permission: "reports.view" },
      { label: "Profit & loss", href: "/reports/profit-loss", permission: "reports.profit" },
      { label: "Product profit", href: "/reports/products", permission: "reports.profit" },
      { label: "Dues", href: "/reports/dues", permission: "reports.view" },
    ],
  },
  {
    label: "Admin",
    icon: ShieldCheck,
    children: [
      { label: "Users & roles", href: "/users", permission: "users.manage" },
      { label: "Activity log", href: "/activity", permission: "activity.view" },
      { label: "Settings", href: "/settings", permission: "settings.manage" },
    ],
  },
];

function allow(permissions: string[], key?: PermissionKey): boolean {
  if (!key) return true;
  return permissions.includes("*") || permissions.includes(key);
}

export type VisibleNav = {
  pinned: PinnedLink[];
  groups: NavGroup[];
};

/** The nav a given role should actually see — leaves filtered, empty groups dropped. */
export function visibleNav(permissions: string[] | undefined): VisibleNav {
  const perms = permissions ?? [];
  const pinned = pinnedLinks.filter((l) => allow(perms, l.permission));
  const groups = navGroups
    .map((g) => ({ ...g, children: g.children.filter((c) => allow(perms, c.permission)) }))
    .filter((g) => g.children.length > 0);
  return { pinned, groups };
}
