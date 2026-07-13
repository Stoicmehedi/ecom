import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { money, num, qty, shortDate } from "@/lib/format";
import { parseRange } from "@/lib/reports/range";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdjustmentTypesButton, NewAdjustmentButton, AdjustmentRowActions } from "./adjustment-client";

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!hasPermission(session, "stock.adjust")) redirect("/dashboard");

  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;
  const hasRange = one("from") || one("to") || one("preset");
  const range = parseRange(hasRange ? sp : { ...sp, preset: "month" });

  const [adjustments, types] = await Promise.all([
    prisma.stockAdjustment.findMany({
      where: { date: { gte: range.from, lte: range.to } },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      include: {
        adjustmentType: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: { include: { variant: { select: { sku: true } } } },
      },
    }),
    prisma.adjustmentType.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { adjustments: true } } },
    }),
  ]);

  const totalLoss = adjustments.reduce((s, a) => s + num(a.lossValue), 0);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Stock adjustments"
        description="Damage, loss and miscounts — the only way stock moves without being bought, sold or returned."
      >
        <div className="flex gap-2">
          <AdjustmentTypesButton types={types} />
          <NewAdjustmentButton types={types} />
        </div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-[1fr_260px]">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Loss at cost</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No adjustments in this period.
                  </TableCell>
                </TableRow>
              )}

              {adjustments.map((a) => {
                const units = a.items.reduce((s, i) => s + num(i.delta), 0);
                const loss = num(a.lossValue);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.adjustmentNo}</TableCell>
                    <TableCell className="whitespace-nowrap">{shortDate(a.date)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {a.adjustmentType.name}
                        {loss < 0 && <Badge variant="secondary">Stock found</Badge>}
                      </div>
                      {a.remark && (
                        <p className="text-xs text-muted-foreground">{a.remark}</p>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {a.items.map((i) => i.variant.sku).join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {units > 0 ? `+${qty(units)}` : qty(units)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(loss)}</TableCell>
                    <TableCell>
                      <AdjustmentRowActions id={a.id} adjustmentNo={a.adjustmentNo} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">Lost at cost — {range.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{money(totalLoss)}</p>
            <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
              Posted to the P&amp;L as a <strong>Stock loss</strong> expense. No cash moved —
              the shop lost goods, not money.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
