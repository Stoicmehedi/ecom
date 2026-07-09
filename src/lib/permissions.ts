import type { Session } from "next-auth";

/**
 * Permission check. `["*"]` on the role grants all-access.
 * Usage: hasPermission(session, "sales.create")
 */
export function hasPermission(
  session: Session | null | undefined,
  key: string,
): boolean {
  const perms = session?.user?.permissions;
  if (!perms || perms.length === 0) return false;
  if (perms.includes("*")) return true;
  return perms.includes(key);
}
