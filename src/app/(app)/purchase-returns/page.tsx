import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { money, shortDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReturnRowActions } from "./return-row-actions";

export default async function PurchaseReturnsPage() {
  const session = await auth();
  if (!hasPermission(session, "purchases.view")) redirect("/dashboard");
  const returns = await prisma.purchaseReturn.findMany({
    orderBy: { id: "desc" },
    include: {
      supplier: { select: { name: true } },
      purchase: { select: { id: true, purchaseNo: true } },
      returnType: { select: { name: true } },
      _count: { select: { items: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Buying"
        title="Purchase Returns"
        description="Goods sent back to suppliers."
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Return no.</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Against</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Refunded</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {returns.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No purchase returns yet.
                </TableCell>
              </TableRow>
            )}
            {returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.returnNo}</TableCell>
                <TableCell className="text-muted-foreground">
                  {shortDate(r.date)}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/purchases/${r.purchase.id}`}
                    className="hover:text-primary hover:underline"
                  >
                    {r.purchase.purchaseNo}
                  </Link>
                </TableCell>
                <TableCell>{r.supplier?.name ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{r.returnType.name}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r._count.items}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(r.total)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {money(r.refunded)}
                </TableCell>
                <TableCell>
                  <ReturnRowActions id={r.id} returnNo={r.returnNo} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
