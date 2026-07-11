import { prisma } from "@/lib/prisma";

export type CatalogOptions = {
  categories: { id: number; name: string; level: number; parentId: number | null }[];
  brands: { id: number; name: string }[];
  units: { id: number; name: string }[];
  axes: { id: number; name: string; attributes: { id: number; name: string }[] }[];
  colors: { id: number; name: string; hex: string | null }[];
};

export async function getCatalogOptions(): Promise<CatalogOptions> {
  const [cats, brands, units, axes, colors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.unit.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.attributeCategory.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        attributes: {
          orderBy: [{ sortIndex: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        },
      },
    }),
    prisma.color.findMany({
      orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
      select: { id: true, name: true, hex: true },
    }),
  ]);

  const byParent = new Map<number | null, typeof cats>();
  for (const c of cats) {
    const l = byParent.get(c.parentId) ?? [];
    l.push(c);
    byParent.set(c.parentId, l);
  }
  const categories: CatalogOptions["categories"] = [];
  const walk = (parentId: number | null) => {
    for (const c of byParent.get(parentId) ?? []) {
      categories.push({
        id: c.id,
        name: c.name,
        level: c.level,
        parentId: c.parentId,
      });
      walk(c.id);
    }
  };
  walk(null);

  return { categories, brands, units, axes, colors };
}
