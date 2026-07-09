import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { CatalogTabs } from "@/components/app/catalog-tabs";
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
  AddCategoryButton,
  CategoryRowActions,
  type ParentOption,
} from "./category-dialog";

export default async function CategoriesPage() {
  const all = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });

  type Row = (typeof all)[number];

  // Order rows as a tree (parents before their children).
  const byParent = new Map<number | null, Row[]>();
  for (const c of all) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  const ordered: Row[] = [];
  const walk = (parentId: number | null) => {
    for (const c of byParent.get(parentId) ?? []) {
      ordered.push(c);
      walk(c.id);
    }
  };
  walk(null);

  const parentOptions: ParentOption[] = all
    .filter((c) => c.level < 3)
    .map((c) => ({ id: c.id, name: c.name, level: c.level }));

  const levelLabel = ["", "Category", "Sub-category", "Child"];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <PageHeader
        title="Categories"
        description="Organize products in up to 3 levels."
      >
        <AddCategoryButton parentOptions={parentOptions} />
      </PageHeader>
      <CatalogTabs />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-36">Level</TableHead>
              <TableHead className="w-28">Products</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No categories yet. Add your first one.
                </TableCell>
              </TableRow>
            )}
            {ordered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <span style={{ paddingLeft: (c.level - 1) * 20 }}>
                    {c.level > 1 && (
                      <span className="text-muted-foreground">↳ </span>
                    )}
                    {c.name}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{levelLabel[c.level]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {c._count.products}
                </TableCell>
                <TableCell>
                  <CategoryRowActions
                    category={{
                      id: c.id,
                      name: c.name,
                      level: c.level,
                      parentId: c.parentId,
                    }}
                    parentOptions={parentOptions}
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
