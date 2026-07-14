import { prisma } from "@/lib/prisma";

export type CategoryNode = {
  id: number;
  name: string;
  level: number;
  parentId: number | null;
  /** "Apparel › Tops › T-Shirts" — two leaves can share a name, a path cannot. */
  path: string;
};

/** Every category, depth-first (a parent immediately followed by its children). */
export async function getCategoryTree(): Promise<CategoryNode[]> {
  const rows = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, level: true, parentId: true },
  });

  const byParent = new Map<number | null, typeof rows>();
  for (const c of rows) {
    const kids = byParent.get(c.parentId) ?? [];
    kids.push(c);
    byParent.set(c.parentId, kids);
  }

  const out: CategoryNode[] = [];
  const walk = (parentId: number | null, prefix: string) => {
    for (const c of byParent.get(parentId) ?? []) {
      const path = prefix ? `${prefix} › ${c.name}` : c.name;
      out.push({ ...c, path });
      walk(c.id, path);
    }
  };
  walk(null, "");
  return out;
}

/**
 * A category and everything beneath it.
 *
 * A product is filed at the *deepest* level whoever added it picked, so a shirt
 * lives on "T-Shirts", never on "Apparel". Matching `categoryId` exactly would
 * therefore make every non-leaf category filter to an empty screen. Filtering on
 * a category has to mean "this one and all its descendants".
 */
export function subtreeIds(tree: CategoryNode[], id: number): number[] {
  const ids = [id];
  for (const node of tree) {
    // Depth-first order guarantees a parent is seen before its children, so one
    // pass is enough to pull a whole branch in.
    if (node.parentId !== null && ids.includes(node.parentId)) ids.push(node.id);
  }
  return ids;
}

/** The Prisma filter for "in this category or any below it". */
export function categoryFilter(tree: CategoryNode[], id: number | undefined) {
  return id ? { categoryId: { in: subtreeIds(tree, id) } } : {};
}

/**
 * The tree pruned to branches that actually hold a sellable product. An empty
 * option in a filter is a dead end the cashier has to discover by clicking it.
 */
export async function getSellableCategoryTree(): Promise<CategoryNode[]> {
  const [tree, used] = await Promise.all([
    getCategoryTree(),
    prisma.product.findMany({
      where: { isActive: true, categoryId: { not: null } },
      distinct: ["categoryId"],
      select: { categoryId: true },
    }),
  ]);

  // A branch survives if any of its descendants holds a product — so "Apparel"
  // stays selectable even though nothing is filed directly on it.
  const live = new Set(used.map((p) => p.categoryId as number));
  return tree.filter((n) => subtreeIds(tree, n.id).some((id) => live.has(id)));
}
