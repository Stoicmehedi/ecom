import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { money, num } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddCustomerButton, CustomerRowActions } from "./customer-dialog";

export default async function CustomersPage() {
  const [customers, groups] = await Promise.all([
    prisma.contact.findMany({
      where: { type: "CUSTOMER" },
      orderBy: [{ isWalkIn: "desc" }, { name: "asc" }],
      include: {
        customerGroup: { select: { id: true, name: true, discount: true } },
        sales: { select: { total: true, paid: true } },
      },
    }),
    prisma.customerGroup.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, discount: true },
    }),
  ]);

  const groupOptions = groups.map((g) => ({
    id: g.id,
    name: g.name,
    discount: num(g.discount),
  }));

  const totalDue = customers.reduce((s, c) => s + num(c.dueBalance), 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Customers"
        description="Who you sell to, and what they owe you."
      >
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/customer-groups">Groups</Link>
          </Button>
          <AddCustomerButton groups={groupOptions} />
        </div>
      </PageHeader>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Received</TableHead>
              <TableHead className="text-right">Due</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No customers yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {customers.map((c) => {
              const sold = c.sales.reduce((a, s) => a + num(s.total), 0);
              const received = c.sales.reduce((a, s) => a + num(s.paid), 0);
              const due = num(c.dueBalance);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/customers/${c.id}`}
                      className="hover:text-primary hover:underline"
                    >
                      {c.name}
                    </Link>
                    {c.isWalkIn && (
                      <Badge variant="secondary" className="ml-2">
                        Walk-in
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.phone ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.customerGroup ? (
                      <Badge variant="outline">
                        {c.customerGroup.name} · {num(c.customerGroup.discount)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(sold)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(received)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      due > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {money(due)}
                  </TableCell>
                  <TableCell>
                    <CustomerRowActions
                      groups={groupOptions}
                      customer={{
                        id: c.id,
                        name: c.name,
                        phone: c.phone,
                        businessName: c.businessName,
                        email: c.email,
                        address: c.address,
                        note: c.note,
                        customerGroupId: c.customerGroupId,
                        openingBalance: num(c.openingBalance),
                        loyaltyPoints: c.loyaltyPoints,
                        isWalkIn: c.isWalkIn,
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {customers.length > 0 && (
        <p className="text-right text-sm text-muted-foreground">
          Total owed by customers:{" "}
          <span className="font-medium tabular-nums text-foreground">
            {money(totalDue)}
          </span>
        </p>
      )}
    </div>
  );
}
