import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { num } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddGroupButton, GroupRowActions } from "./group-dialog";

export default async function CustomerGroupsPage() {
  const session = await auth();
  if (!hasPermission(session, "contacts.manage")) redirect("/dashboard");
  const groups = await prisma.customerGroup.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { customers: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <PageHeader
        eyebrow="Customers"
        title="Customer Groups"
        description="Give a group of customers a standing discount."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href="/customers">Customers</Link>
          </Button>
          <AddGroupButton />
        </div>
      </PageHeader>

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-40 text-right">Default discount</TableHead>
              <TableHead className="w-28 text-right">Customers</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No groups yet. Add one to give regulars a standing discount.
                </TableCell>
              </TableRow>
            )}
            {groups.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="font-medium">{g.name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {num(g.discount)}%
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {g._count.customers}
                </TableCell>
                <TableCell>
                  <GroupRowActions
                    group={{ id: g.id, name: g.name, discount: num(g.discount) }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
