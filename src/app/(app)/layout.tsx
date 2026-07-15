import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/ui-prefs";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user;

  // Read the sidebar's last state on the server so the first paint already
  // matches — no flash of an open sidebar snapping shut after hydration.
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === "1";

  return (
    <AppShell
      storeName={user.branchName ?? "Main Store"}
      userName={user.name ?? user.username ?? "User"}
      userRole={user.role ?? null}
      permissions={user.permissions ?? []}
      defaultCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
