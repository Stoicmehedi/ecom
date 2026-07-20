import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app/app-shell";
import { prisma } from "@/lib/prisma";
import { fileUrl } from "@/lib/files";
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

  // The shop's logo replaces the default mark in the chrome, when one is set.
  // A PK read, not getSettings() — we don't want an upsert on every navigation.
  const shop = await prisma.shopSetting.findUnique({
    where: { id: 1 },
    select: { logoKey: true },
  });
  const logoUrl = fileUrl(shop?.logoKey);

  return (
    <AppShell
      storeName={user.branchName ?? "Main Store"}
      userName={user.name ?? user.username ?? "User"}
      userRole={user.role ?? null}
      permissions={user.permissions ?? []}
      defaultCollapsed={collapsed}
      logoUrl={logoUrl}
    >
      {children}
    </AppShell>
  );
}
