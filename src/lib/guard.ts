import { auth } from "@/lib/auth";
import { hasPermission, permissionLabel, type PermissionKey } from "@/lib/permissions";

/**
 * The gate a server action stands behind (BLUEPRINT §25.3).
 *
 * One function, so that eighteen action files cannot each invent their own slightly
 * different check — and so that adding a gate is a one-liner with no excuse not to:
 *
 *   const denied = await requirePermission("purchases.manage");
 *   if (denied) return { error: denied };
 *
 * Returns the refusal *message* when the caller may not proceed, and `null` when they
 * may. It reads the session on the server every time; nothing the browser sends is
 * trusted, which is what makes it hold against a forged wire payload.
 */
export async function requirePermission(key: PermissionKey): Promise<string | null> {
  const session = await auth();
  if (!session?.user) return "You are not signed in.";
  if (!hasPermission(session, key)) {
    return `You do not have permission to ${permissionLabel(key).toLowerCase()}.`;
  }
  return null;
}
