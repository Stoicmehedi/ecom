import type { Session } from "next-auth";

/**
 * Who may do what (BLUEPRINT §25).
 *
 * **This list IS the enforcement list.** Every key below is checked by a real page and a
 * real server action; every check in the app uses a key from below. That is the whole
 * point of the file: the role editor ticks these boxes, so a box that guarded nothing
 * would be a lie told to the shopkeeper — a control panel wired to nothing.
 *
 * MPoS shipped with exactly that for a while: the Cashier role held `pos.access`,
 * `products.view` and `contacts.view`, and **nothing anywhere checked them**, while a
 * cashier could delete a sale, delete a purchase and bulk-import the catalogue because
 * twelve of the eighteen action files had no gate at all. If you add a key here, gate
 * something with it in the same commit. If you gate something, add the key here.
 */

export type PermissionKey =
  // The till
  | "pos.access"
  | "sales.create"
  | "sales.free_issue"
  // Sales
  | "sales.view"
  | "sales.return"
  | "sales.delete"
  // Products
  | "products.view"
  | "products.manage"
  | "products.masters"
  // Purchases
  | "purchases.view"
  | "purchases.manage"
  | "purchases.return"
  // Inventory
  | "stock.view"
  | "stock.adjust"
  // People
  | "contacts.view"
  | "contacts.manage"
  | "contacts.delete"
  | "contacts.due"
  // Money
  | "expenses.manage"
  | "accounts.manage"
  | "employees.manage"
  // Insight
  | "reports.view"
  | "reports.profit"
  // Admin
  | "settings.manage"
  | "users.manage";

export type PermissionGroup = {
  group: string;
  items: { key: PermissionKey; label: string; hint?: string }[];
};

/** The catalogue, grouped the way a shopkeeper thinks — this is what the role editor renders. */
export const PERMISSIONS: PermissionGroup[] = [
  {
    group: "The till",
    items: [
      { key: "pos.access", label: "Use the POS" },
      { key: "sales.create", label: "Ring up a sale" },
      {
        key: "sales.free_issue",
        label: "Give an item away free",
        hint: "Sell at zero — stock leaves, nothing is charged.",
      },
    ],
  },
  {
    group: "Sales",
    items: [
      { key: "sales.view", label: "See sales and invoices" },
      { key: "sales.return", label: "Take goods back", hint: "Sale returns and exchanges." },
      {
        key: "sales.delete",
        label: "Delete a sale",
        hint: "Reverses stock and money. Rewrites history.",
      },
    ],
  },
  {
    group: "Products",
    items: [
      { key: "products.view", label: "See the catalogue", hint: "Selling prices only — never cost." },
      {
        key: "products.manage",
        label: "Add, edit, delete and import products",
        hint: "Includes the bulk CSV import.",
      },
      { key: "products.masters", label: "Edit categories, brands, units and colours" },
    ],
  },
  {
    group: "Purchases",
    items: [
      { key: "purchases.view", label: "See purchases" },
      {
        key: "purchases.manage",
        label: "Create and delete a purchase",
        hint: "Moves stock, cost and what we owe the supplier.",
      },
      { key: "purchases.return", label: "Return goods to a supplier" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { key: "stock.view", label: "See stock levels" },
      { key: "stock.adjust", label: "Adjust stock", hint: "Write-offs and recounts." },
    ],
  },
  {
    group: "Customers & suppliers",
    items: [
      { key: "contacts.view", label: "See customers and suppliers" },
      { key: "contacts.manage", label: "Add and edit them" },
      { key: "contacts.delete", label: "Delete one" },
      { key: "contacts.due", label: "Take or make a due payment", hint: "Money over the counter." },
    ],
  },
  {
    group: "Money",
    items: [
      { key: "expenses.manage", label: "Expenses" },
      { key: "accounts.manage", label: "Accounts, deposits and transfers" },
      { key: "employees.manage", label: "Staff and salary" },
    ],
  },
  {
    group: "Insight",
    items: [
      { key: "reports.view", label: "See reports" },
      {
        key: "reports.profit",
        label: "See cost and profit",
        hint: "Without this, reports show what sold — not what it earned.",
      },
    ],
  },
  {
    group: "Administration",
    items: [
      { key: "settings.manage", label: "Shop settings" },
      { key: "users.manage", label: "Users and roles", hint: "The keys to the shop." },
    ],
  },
];

/** Every key, flat. Used to validate what a role editor submits. */
export const ALL_PERMISSIONS: PermissionKey[] = PERMISSIONS.flatMap((g) =>
  g.items.map((i) => i.key),
);

export function isPermissionKey(key: string): key is PermissionKey {
  return (ALL_PERMISSIONS as string[]).includes(key);
}

/** What a key guards, in words — used to explain a refusal. */
export function permissionLabel(key: PermissionKey): string {
  for (const g of PERMISSIONS) {
    for (const i of g.items) if (i.key === key) return i.label;
  }
  return key;
}

/**
 * Permission check. `["*"]` on the role grants all-access — it is not a key and never
 * appears in the matrix; it is the absence of a limit.
 */
export function hasPermission(
  session: Session | null | undefined,
  key: PermissionKey,
): boolean {
  const perms = session?.user?.permissions;
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  return perms.includes(key);
}
