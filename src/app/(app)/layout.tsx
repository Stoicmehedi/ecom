import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AppShell } from "@/components/app/app-shell";

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

  return (
    <AppShell
      storeName={user.branchName ?? "Main Store"}
      userName={user.name ?? user.username ?? "User"}
      userRole={user.role ?? null}
    >
      {children}
    </AppShell>
  );
}
