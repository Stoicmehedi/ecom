import { prisma } from "@/lib/prisma";
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
import { AddBrandButton, BrandRowActions } from "./brand-dialog";

export default async function BrandsPage() {
  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader title="Brands" description="Manage product brands.">
        <AddBrandButton />
      </PageHeader>
      <CatalogTabs />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-28">Products</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No brands yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {brands.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.name}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {b._count.products}
                </TableCell>
                <TableCell>
                  <BrandRowActions brand={{ id: b.id, name: b.name }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
