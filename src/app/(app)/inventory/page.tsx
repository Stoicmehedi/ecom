import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { money, num, qty } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

// The fallback threshold is a shop-wide SETTING now (BLUEPRINT §17.2), not a
// constant here. A product with its own `alertQty` still overrides it.

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ low?: string }>;
}) {
  const { low } = await searchParams;
  const lowOnly = low === "1";

  // Cost and stock-at-cost value are profit figures (BLUEPRINT §11.2) — a
  // cashier sees what is on the shelf, not what it cost or what it earns.
  const session = await auth();
  const canSeeCost = hasPermission(session, "reports.profit");

  const settings = await getSettings();

  const [variants, movements] = await Promise.all([
    prisma.productVariant.findMany({
      orderBy: [{ productId: "asc" }, { id: "asc" }],
      include: {
        product: { select: { name: true, isActive: true, alertQty: true } },
      },
    }),
    prisma.stockMovement.groupBy({
      by: ["variantId"],
      _sum: { qty: true },
      where: { qty: { gt: 0 } },
    }),
  ]);

  const outMovements = await prisma.stockMovement.groupBy({
    by: ["variantId"],
    _sum: { qty: true },
    where: { qty: { lt: 0 } },
  });

  const inByVariant = new Map(movements.map((m) => [m.variantId, num(m._sum.qty)]));
  const outByVariant = new Map(
    outMovements.map((m) => [m.variantId, Math.abs(num(m._sum.qty))]),
  );

  const rows = variants
    .map((v) => {
      const stock = num(v.stockQty);
      const avg = num(v.purchasePrice);
      const sell = num(v.sellingPrice);
      // The product's own threshold if it set one, else the shop default.
      const alertAt =
        v.product.alertQty == null
          ? settings.defaultAlertQty
          : num(v.product.alertQty);
      return {
        id: v.id,
        name: v.label ? `${v.product.name} — ${v.label}` : v.product.name,
        sku: v.sku,
        active: v.product.isActive,
        avg,
        last: v.lastPurchasePrice == null ? null : num(v.lastPurchasePrice),
        sell,
        inQty: inByVariant.get(v.id) ?? 0,
        outQty: outByVariant.get(v.id) ?? 0,
        stock,
        alertAt,
        low: stock <= alertAt,
        valueCost: stock * avg,
        valueSell: stock * sell,
      };
    })
    .filter((r) => (lowOnly ? r.low : true));

  const totalCost = rows.reduce((s, r) => s + r.valueCost, 0);
  const totalSell = rows.reduce((s, r) => s + r.valueSell, 0);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeader
        title="Inventory"
        description={
          canSeeCost
            ? "What you hold, what it cost, and what it's worth."
            : "What you hold, and what it's worth at the till."
        }
      >
        <Link
          href={lowOnly ? "/inventory" : "/inventory?low=1"}
          className="text-sm text-primary underline"
        >
          {lowOnly ? "Show all" : "Low stock only"}
        </Link>
      </PageHeader>

      <div
        className={cn(
          "grid gap-4",
          canSeeCost ? "sm:grid-cols-3" : "sm:grid-cols-2",
        )}
      >
        <Stat label="Variants in view" value={String(rows.length)} />
        {canSeeCost && (
          <Stat label="Stock value at cost" value={money(totalCost)} />
        )}
        <Stat label="Stock value at selling price" value={money(totalSell)} />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              {canSeeCost && (
                <>
                  <TableHead className="text-right">Avg. cost</TableHead>
                  <TableHead className="text-right">Last cost</TableHead>
                </>
              )}
              <TableHead className="text-right">Selling</TableHead>
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              {canSeeCost && (
                <TableHead className="text-right">Value @ cost</TableHead>
              )}
              <TableHead className="text-right">Value @ selling</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canSeeCost ? 9 : 6}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {lowOnly ? "Nothing is running low." : "No stock yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-muted-foreground">{r.sku}</span>
                </TableCell>
                {canSeeCost && (
                  <>
                    <TableCell className="text-right tabular-nums">
                      {money(r.avg)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.last == null ? "—" : money(r.last)}
                    </TableCell>
                  </>
                )}
                <TableCell className="text-right tabular-nums">{money(r.sell)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {qty(r.inQty)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {qty(r.outQty)}
                </TableCell>
                <TableCell className="text-right">
                  {r.stock <= 0 ? (
                    <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/10">
                      {qty(r.stock)}
                    </Badge>
                  ) : r.low ? (
                    <Badge className="bg-amber-500/10 text-amber-600 hover:bg-amber-500/10">
                      {qty(r.stock)}
                    </Badge>
                  ) : (
                    <span className="font-medium tabular-nums">{qty(r.stock)}</span>
                  )}
                </TableCell>
                {canSeeCost && (
                  <TableCell className="text-right tabular-nums">
                    {money(r.valueCost)}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {money(r.valueSell)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
