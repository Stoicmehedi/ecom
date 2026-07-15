import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { money, num } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddSupplierButton, SupplierRowActions } from "./supplier-dialog";

export default async function SuppliersPage() {
  const session = await auth();
  if (!hasPermission(session, "contacts.view")) redirect("/dashboard");
  const canDelete = hasPermission(session, "contacts.delete");
  const suppliers = await prisma.contact.findMany({
    where: { type: "SUPPLIER" },
    orderBy: { name: "asc" },
    include: {
      purchases: { select: { total: true, paid: true } },
    },
  });

  const totalDue = suppliers.reduce((s, c) => s + num(c.dueBalance), 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Buying"
        title="Suppliers"
        description="Who you buy from, and what you owe them."
      >
        <AddSupplierButton />
      </PageHeader>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Purchased</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No suppliers yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {suppliers.map((s) => {
              const purchased = s.purchases.reduce((a, p) => a + num(p.total), 0);
              const paid = s.purchases.reduce((a, p) => a + num(p.paid), 0);
              const due = num(s.dueBalance);
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/suppliers/${s.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {s.name}
                    </Link>
                    {s.businessName && (
                      <span className="block text-xs text-muted-foreground">
                        {s.businessName}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(purchased)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(paid)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums font-medium ${
                      due > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {money(due)}
                  </TableCell>
                  <TableCell>
                    <SupplierRowActions
                      canDelete={canDelete}
                      supplier={{
                        id: s.id,
                        name: s.name,
                        phone: s.phone,
                        businessName: s.businessName,
                        email: s.email,
                        address: s.address,
                        note: s.note,
                        openingBalance: num(s.openingBalance),
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {suppliers.length > 0 && (
        <p className="text-right text-sm text-muted-foreground">
          Total owed to suppliers:{" "}
          <span className="font-medium text-foreground tabular-nums">
            {money(totalDue)}
          </span>
        </p>
      )}
    </div>
  );
}
