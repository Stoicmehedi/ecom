import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Boxes,
  ScanBarcode,
  Receipt,
  Undo2,
  RotateCcw,
  Repeat,
  Users,
  Truck,
  BarChart3,
  Wallet,
  ClipboardCheck,
  Settings,
  type LucideIcon,
  Landmark,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the signed-in role holds this. Absent = everyone sees it. */
  permission?: string;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/products", icon: Package },
  { label: "Purchases", href: "/purchases", icon: ShoppingBag },
  { label: "Purchase Returns", href: "/purchase-returns", icon: Undo2 },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  {
    label: "Adjustments",
    href: "/adjustments",
    icon: ClipboardCheck,
    permission: "stock.adjust",
  },
  { label: "POS", href: "/pos", icon: ScanBarcode },
  { label: "Sales", href: "/sales", icon: Receipt },
  { label: "Sale Returns", href: "/sale-returns", icon: RotateCcw },
  { label: "Exchanges", href: "/exchanges", icon: Repeat },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Expenses", href: "/expenses", icon: Wallet, permission: "expenses.manage" },
  { label: "Accounts", href: "/accounts", icon: Landmark, permission: "accounts.manage" },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings, permission: "settings.manage" },
];

/**
 * The nav a given role should see. A link that only bounces you to /dashboard is
 * worse than no link — it advertises a door you cannot open. (Settings has been
 * doing exactly that to cashiers since it was built; it stops here.)
 */
export function visibleNavItems(permissions: string[] | undefined): NavItem[] {
  const perms = permissions ?? [];
  const all = perms.includes("*");
  return navItems.filter((i) => !i.permission || all || perms.includes(i.permission));
}
