import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";

/**
 * The two keys that gate reporting (BLUEPRINT §11.2).
 *
 * `reports.view` opens the reports at all; `reports.profit` is needed on top of
 * it for anything that reveals cost or margin. The export API checks the same
 * pair — a screen and its export must never disagree about who may see it.
 */
export async function reportAccess() {
  const session = await auth();
  return {
    canView: hasPermission(session, "reports.view"),
    canSeeProfit: hasPermission(session, "reports.profit"),
  };
}
