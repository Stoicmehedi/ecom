"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pointsToReverse, pointsValue } from "@/lib/loyalty";
import type { ShopSettings } from "@/lib/settings";
import { saveSaleReturn } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { qtyStep } from "@/lib/qty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReturnLine = {
  saleItemId: number;
  label: string;
  sku: string;
  price: number;
  soldQty: number;
  returnedQty: number;
  qty: number;
  /** Whether half of this can come back — a shirt's cannot (BLUEPRINT §21). */
  allowDecimal: boolean;
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function SaleReturnForm({
  saleId,
  invoiceNo,
  customerName,
  isWalkIn,
  saleDate,
  saleTotal,
  pointsRedeemed,
  settings,
  lines: initialLines,
}: {
  saleId: number;
  invoiceNo: string;
  customerName: string;
  isWalkIn: boolean;
  saleDate: string;
  saleTotal: number;
  pointsRedeemed: number;
  settings: ShopSettings;
  lines: ReturnLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lines, setLines] = useState(initialLines);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const total = r2(lines.reduce((s, l) => s + l.qty * l.price, 0));

  // If the customer paid part of this bill with points, that part comes back as
  // POINTS, not as money — refunding it in cash would turn points into cash
  // (BLUEPRINT §15.5). Only `payable` can cross the counter. Same functions the
  // server uses, so the two cannot disagree.
  const pointsBack = pointsToReverse(pointsRedeemed, saleTotal, total);
  const pointsBackValue = pointsValue(pointsBack, settings);
  const payable = r2(total - pointsBackValue);

  const maxFor = (l: ReturnLine) => Math.max(0, l.soldQty - l.returnedQty);

  function setQty(i: number, value: number) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        // The `step` stops the spinner producing a fraction; this stops one being
        // typed. Half a shirt cannot come back, because half a shirt never went
        // out (§21). The server refuses it too — this just says so sooner.
        const whole = l.allowDecimal ? value : Math.round(value);
        const capped = Math.max(0, Math.min(whole, maxFor(l)));
        return { ...l, qty: capped };
      }),
    );
  }

  function onSubmit() {
    if (total <= 0) return toast.error("Enter a return quantity for at least one item");
    // A walk-in has no account to credit, and money never goes back (§22.3).
    if (isWalkIn) {
      return toast.error(
        "A walk-in has no account to credit — add them as a customer, or exchange the goods",
      );
    }

    startTransition(async () => {
      const res = await saveSaleReturn({
        saleId,
        date,
        note: note || undefined,
        items: lines
          .filter((l) => l.qty > 0)
          .map((l) => ({ saleItemId: l.saleItemId, qty: l.qty })),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Return recorded — stock restored");
      router.push("/sale-returns");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Customer</Label>
          <Input value={customerName} disabled />
        </div>
        <div className="space-y-2">
          <Label>Sold on</Label>
          <Input value={saleDate} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Return date *</Label>
          <Input
            id="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note">Note</Label>
          <Textarea
            id="note"
            rows={1}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Already returned</TableHead>
              <TableHead className="text-right">Can return</TableHead>
              <TableHead className="w-32 text-right">Return qty</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const max = maxFor(l);
              return (
                <TableRow key={l.saleItemId}>
                  <TableCell>
                    <span className="font-medium">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">{l.sku}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.soldQty}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {l.returnedQty || "—"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {max}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step={qtyStep({ allowDecimal: l.allowDecimal })}
                      min="0"
                      max={max}
                      className="text-right"
                      value={l.qty}
                      disabled={max <= 0}
                      onChange={(e) => setQty(i, Number(e.target.value))}
                    />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {r2(l.qty * l.price).toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* There is no Refund box any more. Money never goes back to a customer
            (BLUEPRINT §22.3) — a control that must never be used is a trap, so the
            software simply cannot do it. The server refuses a refund too. */}
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Credit</h3>
          {isWalkIn ? (
            <p className="text-sm text-destructive">
              This was a <span className="font-medium">walk-in</span> sale, and a walk-in
              has no account to credit. Add them as a customer first, or{" "}
              <span className="font-medium">exchange</span> the goods at the POS instead.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              The goods are credited to{" "}
              <span className="font-medium text-foreground">{customerName}</span>. It comes
              off this invoice first, then anything left over off their other unpaid bills —
              and any surplus stays on their account for next time.
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Summary</h3>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted-foreground">Against</span>
            <span>{invoiceNo}</span>
          </div>
          <div className="flex justify-between border-t py-1 pt-2">
            <span className="text-sm text-muted-foreground">Return value</span>
            <span className="text-base font-semibold tabular-nums">
              {total.toFixed(2)}
            </span>
          </div>
          {pointsBack > 0 && (
            <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
              <div className="flex justify-between text-sm">
                <span className="text-primary">Back as points</span>
                <span className="tabular-nums text-primary">
                  {pointsBack} pts (−{pointsBackValue.toFixed(2)})
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                They paid part of this bill with points, so that part goes back as
                points — not as money.
              </p>
            </div>
          )}
          <div className="flex justify-between border-t py-1 pt-2">
            <span className="text-sm text-muted-foreground">Credited to account</span>
            {/* `payable`, not `total` — points handed back are not money, so they
                never touch the customer's account (BLUEPRINT §15.5). */}
            <span className="text-sm font-medium tabular-nums">{payable.toFixed(2)}</span>
          </div>
          <Button
            className="mt-2 w-full"
            onClick={onSubmit}
            disabled={pending || isWalkIn}
          >
            {pending ? "Saving…" : "Save return"}
          </Button>
        </div>
      </div>
    </div>
  );
}
