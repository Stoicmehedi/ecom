import Image from "next/image";
import { fileUrl } from "@/lib/files";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { Plus, Download, Upload } from "lucide-react";
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
import { money, num, qty } from "@/lib/format";
import { categoryFilter, getCategoryTree } from "@/lib/categories";
import { ProductRowActions } from "./product-row-actions";
import { ProductFilters } from "./product-filters";
import type { Prisma } from "@/generated/prisma/client";

const ALL = "all";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!hasPermission(session, "products.view")) redirect("/dashboard");

  // Seeing the catalogue and changing it are two different permissions (§25.2).
  const canManage = hasPermission(session, "products.manage");
  const canMasters = hasPermission(session, "products.masters");

  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const int = (v: string | undefined) => {
    const n = Number(v);
    return v && Number.isInteger(n) && n > 0 ? n : undefined;
  };

  const q = (one(params.q) ?? "").trim();
  const categoryId = int(one(params.categoryId));
  const brandId = int(one(params.brandId));
  const status = one(params.status) ?? ALL;

  // A product is filed on the deepest category picked for it, so filtering on
  // "Apparel" has to mean "Apparel and everything under it" — an exact match
  // would return an empty page for every category that has children.
  const tree = await getCategoryTree();

  const where: Prisma.ProductWhereInput = {
    ...categoryFilter(tree, categoryId),
    ...(brandId ? { brandId } : {}),
    ...(status === "active"
      ? { isActive: true }
      : status === "inactive"
        ? { isActive: false }
        : {}),
    // A search hits the product's own name/code AND its variants' SKU/barcode —
    // scanning a barcode into the search box should find the product it's on.
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
            { variants: { some: { barcode: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [products, brands, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
      take: 200,
      include: {
        category: { select: { name: true } },
        brand: { select: { name: true } },
        _count: { select: { variants: true } },
        variants: { select: { stockQty: true, sellingPrice: true } },
      },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.product.count(),
  ]);

  const exportHref = `/api/products/export?${new URLSearchParams({
    ...(q ? { q } : {}),
    ...(categoryId ? { categoryId: String(categoryId) } : {}),
    ...(brandId ? { brandId: String(brandId) } : {}),
    ...(status !== ALL ? { status } : {}),
  }).toString()}`;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader title="Products" description="Your catalog of products and variants.">
        <div className="flex gap-2">
          {/* A control that only bounces you is worse than no control — it advertises a
              door you cannot open. The server refuses these regardless (§25.3); hiding
              them is the courtesy that stops a cashier from finding out the hard way. */}
          {canManage && (
            <>
              <Button variant="outline" asChild>
                <a href={exportHref} download>
                  <Download className="size-4" />
                  Export
                </a>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/products/import">
                  <Upload className="size-4" />
                  Import
                </Link>
              </Button>
              <Button asChild>
                <Link href="/products/new">
                  <Plus className="size-4" />
                  Add Product
                </Link>
              </Button>
            </>
          )}
        </div>
      </PageHeader>
      {canMasters && <CatalogTabs />}

      <ProductFilters
        categories={tree.map((c) => ({ id: c.id, name: c.path }))}
        brands={brands}
        q={q}
        categoryId={categoryId}
        brandId={brandId}
        status={status}
      />

      <p className="text-sm text-muted-foreground">
        {products.length === total
          ? `${total} product${total === 1 ? "" : "s"}`
          : `${products.length} of ${total} products`}
      </p>

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
              <TableHead className="w-24 text-right">Price</TableHead>
              <TableHead className="w-20">Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {q || categoryId || brandId || status !== ALL ? (
                    "Nothing matches those filters."
                  ) : (
                    <>
                      No products yet.{" "}
                      <Link href="/products/new" className="text-primary underline">
                        Add your first product
                      </Link>
                      .
                    </>
                  )}
                </TableCell>
              </TableRow>
            )}
            {products.map((p) => {
              const stock = p.variants.reduce((s, v) => s + num(v.stockQty), 0);
              const prices = p.variants.map((v) => num(v.sellingPrice));
              const lo = prices.length ? Math.min(...prices) : 0;
              const hi = prices.length ? Math.max(...prices) : 0;
              return (
                <TableRow key={p.id} className={p.isActive ? undefined : "opacity-60"}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-3">
                      {p.imageKey ? (
                        <Image
                          src={fileUrl(p.imageKey)!}
                          alt=""
                          width={40}
                          height={40}
                          unoptimized
                          className="size-10 shrink-0 rounded border object-cover"
                        />
                      ) : (
                        <span className="size-10 shrink-0 rounded border bg-muted/40" />
                      )}
                      <span>
                        {p.name}
                        {p.code && (
                          <span className="block text-xs text-muted-foreground">
                            {p.code}
                          </span>
                        )}
                      </span>
                    </div>
                  </TableCell>
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
                  <TableCell className="text-right tabular-nums">{qty(stock)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`}
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
                    {canManage && (
                      <ProductRowActions id={p.id} name={p.name} isActive={p.isActive} />
                    )}
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
