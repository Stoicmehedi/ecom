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
import {
  AddCategoryButton,
  CategoryRowActions,
  type CategoryPath,
} from "./category-dialog";

export default async function CategoriesPage() {
  const session = await auth();
  if (!hasPermission(session, "products.masters")) redirect("/dashboard");
  const all = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  type Row = (typeof all)[number];
  const byId = new Map<number, Row>(all.map((c) => [c.id, c]));

  // A branch = a leaf category (one that isn't a parent of anything else).
  const parentIds = new Set<number>();
  for (const c of all) if (c.parentId != null) parentIds.add(c.parentId);
  const leaves = all.filter((c) => !parentIds.has(c.id));

  // Full Category / Sub-category / Child path (with ids) for a leaf.
  const pathOf = (c: Row): CategoryPath => {
    if (c.level === 1) return { catId: c.id, cat: c.name };
    if (c.level === 2) {
      const p = byId.get(c.parentId!)!;
      return { catId: p.id, cat: p.name, subId: c.id, sub: c.name };
    }
    const sub = byId.get(c.parentId!)!;
    const cat = byId.get(sub.parentId!)!;
    return {
      catId: cat.id,
      cat: cat.name,
      subId: sub.id,
      sub: sub.name,
      childId: c.id,
      child: c.name,
    };
  };

  const rows = leaves
    .map((c) => ({ path: pathOf(c), products: c._count.products }))
    .sort(
      (a, b) =>
        a.path.cat.localeCompare(b.path.cat) ||
        (a.path.sub ?? "").localeCompare(b.path.sub ?? "") ||
        (a.path.child ?? "").localeCompare(b.path.child ?? ""),
    );

  const categories = all.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    parentId: c.parentId,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <PageHeader
        eyebrow="Catalogue"
        title="Categories"
        description="Organize products in up to 3 levels."
      >
        <AddCategoryButton categories={categories} />
      </PageHeader>
      <CatalogTabs />

      <div className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category</TableHead>
              <TableHead>Sub-category</TableHead>
              <TableHead>Child</TableHead>
              <TableHead className="w-24 text-right">Products</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No categories yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {rows.map(({ path, products }) => (
              <TableRow key={path.childId ?? path.subId ?? path.catId}>
                <TableCell className="font-medium">{path.cat}</TableCell>
                <TableCell
                  className={path.sub ? undefined : "text-muted-foreground"}
                >
                  {path.sub ?? "—"}
                </TableCell>
                <TableCell
                  className={path.child ? undefined : "text-muted-foreground"}
                >
                  {path.child ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {products}
                </TableCell>
                <TableCell>
                  <CategoryRowActions path={path} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
