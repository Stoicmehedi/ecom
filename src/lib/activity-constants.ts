/**
 * The activity log's own vocabulary (BLUEPRINT §29). Kept in a plain module — no
 * `server-only`, no `auth` — so the client filter dropdowns and the server write
 * helper share one list and cannot drift.
 */

/** Our module names, the way a shopkeeper groups the work. Drives the filter. */
export const ACTIVITY_MODULES = [
  "Sale",
  "Sale Return",
  "Exchange",
  "Purchase",
  "Purchase Return",
  "Due Payment",
  "Expense",
  "Stock Adjustment",
  "Account",
  "Employee",
  "Salary",
  "Product",
  "Category",
  "Brand",
  "Unit",
  "Attribute",
  "Customer",
  "Customer Group",
  "Supplier",
  "Settings",
  "User",
  "Role",
] as const;

export type ActivityModule = (typeof ACTIVITY_MODULES)[number];

export const ACTIVITY_ACTIONS = ["Created", "Updated", "Deleted"] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Page-size choices, shared by the filter dropdown and the query. */
export const PER_PAGE_OPTIONS = [10, 20, 50, 100] as const;
