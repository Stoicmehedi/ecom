import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Boxes,
  ScanBarcode,
  Receipt,
  Undo2,
  RotateCcw,
  Users,
  Truck,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Products", href: "/products", icon: Package },
  { label: "Purchases", href: "/purchases", icon: ShoppingBag },
  { label: "Purchase Returns", href: "/purchase-returns", icon: Undo2 },
  { label: "Inventory", href: "/inventory", icon: Boxes },
  { label: "POS", href: "/pos", icon: ScanBarcode },
  { label: "Sales", href: "/sales", icon: Receipt },
  { label: "Sale Returns", href: "/sale-returns", icon: RotateCcw },
  { label: "Customers", href: "/customers", icon: Users },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];
