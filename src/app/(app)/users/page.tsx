import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission, ALL_PERMISSIONS } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { shortDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AddUserButton,
  UserRowActions,
  AddRoleButton,
  RoleRowActions,
} from "./user-dialogs";

export default async function UsersPage() {
  const session = await auth();
  // The keys to the shop (BLUEPRINT §25). Page gate as well as action gate — the page
  // guard is a courtesy to the honest; the action guard is the one that holds.
  if (!hasPermission(session, "users.manage")) redirect("/dashboard");

  const me = session?.user?.id ? Number(session.user.id) : null;

  const [users, roles] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ isActive: "desc" }, { id: "asc" }],
      include: { role: { select: { id: true, name: true, permissions: true } } },
    }),
    prisma.role.findMany({
      orderBy: { id: "asc" },
      include: { _count: { select: { users: true } } },
    }),
  ]);

  const isAdminRole = (permissions: string[]) => permissions.includes("*");

  const roleOptions = roles.map((r) => ({
    id: r.id,
    name: r.name,
    isAdmin: isAdminRole(r.permissions),
  }));

  const total = ALL_PERMISSIONS.length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <PageHeader
        eyebrow="Admin"
        title="Users & roles"
        description="Who can sign in, and what each of them is allowed to do."
      >
        <div className="flex gap-2">
          <AddRoleButton />
          <AddUserButton roles={roleOptions} />
        </div>
      </PageHeader>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Users</h2>
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.isActive ? undefined : "opacity-60"}>
                  <TableCell className="font-medium">
                    {u.name}
                    {u.id === me && (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{u.username}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.email ?? "—"}
                  </TableCell>
                  <TableCell>
                    {u.role ? (
                      <Badge variant={isAdminRole(u.role.permissions) ? "default" : "outline"}>
                        {u.role.name}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">No role</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {shortDate(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    {u.isActive ? (
                      <span className="text-sm text-primary">Active</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Cannot sign in</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <UserRowActions
                      user={{
                        id: u.id,
                        name: u.name,
                        username: u.username,
                        email: u.email,
                        roleId: u.roleId,
                        isActive: u.isActive,
                      }}
                      roles={roleOptions}
                      isSelf={u.id === me}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Roles</h2>
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Can do</TableHead>
                <TableHead>On this role</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((r) => {
                const admin = isAdminRole(r.permissions);
                // Count only keys the app really enforces. A role holding a key that no
                // gate checks would inflate this number and mean nothing — which is
                // exactly the bug this module was built to end (§25.1).
                const real = r.permissions.filter((p) =>
                  (ALL_PERMISSIONS as string[]).includes(p),
                ).length;

                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm">
                      {admin ? (
                        <span className="text-muted-foreground">
                          Everything — all {total} permissions, and anything added later
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {real} of {total} permissions
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r._count.users === 1 ? "1 user" : `${r._count.users} users`}
                    </TableCell>
                    <TableCell>
                      <RoleRowActions
                        role={{
                          id: r.id,
                          name: r.name,
                          permissions: r.permissions,
                          isAdmin: admin,
                          userCount: r._count.users,
                        }}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
