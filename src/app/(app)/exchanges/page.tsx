import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { money } from "@/lib/format";

export default async function ExchangesPage() {
  const exchanges = await prisma.exchange.findMany({
    orderBy: { id: "desc" },
    include: {
      fromSale: { select: { id: true, invoiceNo: true } },
      toSale: { select: { id: true, invoiceNo: true, total: true } },
      saleReturn: { select: { returnNo: true, refunded: true } },
      customer: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="Exchanges"
        description="Goods swapped at the counter. Each one is a return and a sale, settled together."
      />

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-3 font-medium">Exchange</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Customer</th>
              <th className="p-3 font-medium">Invoice</th>
              <th className="p-3 text-right font-medium">Taken back</th>
              <th className="p-3 text-right font-medium">New sale</th>
              <th className="p-3 text-right font-medium">Refunded</th>
            </tr>
          </thead>
          <tbody>
            {exchanges.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted-foreground">
                  No exchanges yet. Start one from the POS.
                </td>
              </tr>
            )}
            {exchanges.map((x) => (
              <tr key={x.id} className="border-b last:border-0">
                <td className="p-3 font-medium">{x.exchangeNo}</td>
                <td className="p-3 text-muted-foreground">
                  {x.date.toISOString().slice(0, 10)}
                </td>
                <td className="p-3">{x.customer?.name ?? "Walk-in customer"}</td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5">
                    <Link
                      href={`/sales/${x.fromSale.id}`}
                      className="text-muted-foreground hover:underline"
                    >
                      {x.fromSale.invoiceNo}
                    </Link>
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <Link
                      href={`/sales/${x.toSale.id}`}
                      className="font-medium hover:underline"
                    >
                      {x.toSale.invoiceNo}
                    </Link>
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums">{money(Number(x.credit))}</td>
                <td className="p-3 text-right tabular-nums">
                  {money(Number(x.toSale.total))}
                </td>
                <td className="p-3 text-right tabular-nums text-muted-foreground">
                  {Number(x.saleReturn.refunded) > 0
                    ? money(Number(x.saleReturn.refunded))
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
