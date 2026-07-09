import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { CatalogTabs } from "@/components/app/catalog-tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ProductRowActions } from "./product-row-actions";

export default async function ProductsPage() {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      _count: { select: { variants: true } },
      variants: { select: { stockQty: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Products"
        description="Your catalog of products and variants."
      >
        <Button asChild>
          <Link href="/products/new">
            <Plus className="size-4" />
            Add Product
          </Link>
        </Button>
      </PageHeader>
      <CatalogTabs />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Brand</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-24 text-right">Variants</TableHead>
              <TableHead className="w-24 text-right">Stock</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No products yet.{" "}
                  <Link href="/products/new" className="text-primary underline">
                    Add your first product
                  </Link>
                  .
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => {
              const stock = p.variants.reduce(
                (sum, v) => sum + Number(v.stockQty),
                0,
              );
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.category?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.brand?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {p.type === "VARIABLE" ? "Variable" : "Simple"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {p._count.variants}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {stock}
                  </TableCell>
                  <TableCell>
                    {p.isActive ? (
                      <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ProductRowActions id={p.id} name={p.name} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
