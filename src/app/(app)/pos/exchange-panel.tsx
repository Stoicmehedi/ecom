"use client";

import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { toast } from "sonner";
import { findSaleForExchange, type ExchangeSale } from "./exchange";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ExchangePick = {
  sale: ExchangeSale;
  qtys: Record<number, number>;
  credit: number;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Take goods back over the counter against the invoice they went out on.
 *
 * The credit is never typed — it is what the sale's ledger says the customer paid
 * for those goods, discount and all (BLUEPRINT §14). A credit you can type is a
 * hole in the till.
 */
export function ExchangeDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (pick: ExchangePick) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState("");
  const [sale, setSale] = useState<ExchangeSale | null>(null);
  const [qtys, setQtys] = useState<Record<number, number>>({});

  function search() {
    const q = term.trim();
    if (!q) return;
    startTransition(async () => {
      const res = await findSaleForExchange(q);
      if (res.error || !res.sale) {
        toast.error(res.error ?? "Not found");
        return;
      }
      setSale(res.sale);
      setQtys({});
    });
  }

  const credit = sale
    ? r2(
        sale.lines.reduce((s, l) => s + (qtys[l.saleItemId] ?? 0) * l.unitPrice, 0),
      )
    : 0;

  function reset() {
    setTerm("");
    setSale(null);
    setQtys({});
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Exchange</DialogTitle>
          <DialogDescription>
            Find the invoice the goods went out on, then take back what is coming back.
            The rest of the cart is what replaces it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="exq">Invoice number</Label>
            <Input
              id="exq"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
              placeholder="INV-00001"
              autoFocus
            />
          </div>
          <Button variant="secondary" onClick={search} disabled={pending}>
            <Search className="size-4" />
            Find
          </Button>
        </div>

        {sale && (
          <>
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm">
              <div>
                <p className="font-medium">{sale.invoiceNo}</p>
                <p className="text-muted-foreground">
                  {sale.customerName} · {sale.date}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={reset} aria-label="Clear">
                <X className="size-4" />
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Item</th>
                    <th className="p-2 text-right font-medium">Paid</th>
                    <th className="p-2 text-right font-medium">Can return</th>
                    <th className="w-28 p-2 text-right font-medium">Take back</th>
                  </tr>
                </thead>
                <tbody>
                  {sale.lines.map((l) => (
                    <tr key={l.saleItemId} className="border-b last:border-0">
                      <td className="p-2">
                        <p className="font-medium">{l.label}</p>
                        <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {l.unitPrice.toFixed(2)}
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {l.returnable}
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min="0"
                          max={l.returnable}
                          step="0.001"
                          className="h-8 text-right"
                          value={qtys[l.saleItemId] ?? ""}
                          placeholder="0"
                          onChange={(e) => {
                            const n = Math.min(
                              Math.max(Number(e.target.value) || 0, 0),
                              l.returnable,
                            );
                            setQtys((prev) => {
                              const next = { ...prev };
                              if (n <= 0) delete next[l.saleItemId];
                              else next[l.saleItemId] = n;
                              return next;
                            });
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm text-muted-foreground">
                Credit for the goods coming back
              </span>
              <span className="text-xl font-semibold tabular-nums">
                {credit.toFixed(2)}
              </span>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={!sale || credit <= 0}
            onClick={() => {
              if (!sale) return;
              onConfirm({ sale, qtys, credit });
              onOpenChange(false);
              reset();
            }}
          >
            Take these back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
