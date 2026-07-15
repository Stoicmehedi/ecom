import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { CatalogTabs } from "@/components/app/catalog-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AddUnitButton, UnitRowActions } from "./unit-dialog";

export default async function UnitsPage() {
  const session = await auth();
  if (!hasPermission(session, "products.masters")) redirect("/dashboard");
  const units = await prisma.unit.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <PageHeader eyebrow="Catalogue" title="Units" description="Units of measure for products.">
        <AddUnitButton />
      </PageHeader>
      <CatalogTabs />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-32">Short</TableHead>
              <TableHead className="w-36">Quantities</TableHead>
              <TableHead className="w-28">Products</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No units yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {units.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.shortName ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={u.allowDecimal ? "secondary" : "outline"}>
                    {u.allowDecimal ? "Fractional" : "Whole only"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {u._count.products}
                </TableCell>
                <TableCell>
                  <UnitRowActions unit={u} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
