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
  IdCard,
  ShieldCheck,
} from "lucide-react";
import type { PermissionKey } from "@/lib/permissions";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Hidden unless the signed-in role holds this. Absent = everyone sees it.
   * Typed against the catalogue (§25.2), so a link cannot point at a permission
   * that no gate enforces — which is exactly how three decorative keys survived.
   */
  permission?: PermissionKey;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/products", icon: Package, permission: "products.view" },
  {
    label: "Purchases",
    href: "/purchases",
    icon: ShoppingBag,
    permission: "purchases.view",
  },
  {
    label: "Purchase Returns",
    href: "/purchase-returns",
    icon: Undo2,
    permission: "purchases.return",
  },
  { label: "Inventory", href: "/inventory", icon: Boxes, permission: "stock.view" },
  {
    label: "Adjustments",
    href: "/adjustments",
    icon: ClipboardCheck,
    permission: "stock.adjust",
  },
  { label: "POS", href: "/pos", icon: ScanBarcode, permission: "pos.access" },
  { label: "Sales", href: "/sales", icon: Receipt, permission: "sales.view" },
  {
    label: "Sale Returns",
    href: "/sale-returns",
    icon: RotateCcw,
    permission: "sales.return",
  },
  { label: "Exchanges", href: "/exchanges", icon: Repeat, permission: "sales.view" },
  { label: "Customers", href: "/customers", icon: Users, permission: "contacts.view" },
  { label: "Suppliers", href: "/suppliers", icon: Truck, permission: "contacts.view" },
  { label: "Expenses", href: "/expenses", icon: Wallet, permission: "expenses.manage" },
  { label: "Accounts", href: "/accounts", icon: Landmark, permission: "accounts.manage" },
  {
    label: "Employees",
    href: "/employees",
    icon: IdCard,
    permission: "employees.manage",
  },
  { label: "Reports", href: "/reports", icon: BarChart3, permission: "reports.view" },
  { label: "Users", href: "/users", icon: ShieldCheck, permission: "users.manage" },
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
