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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank transfer" },
  { value: "MOBILE", label: "Mobile banking" },
];

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
  accounts,
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
  accounts: { id: number; name: string }[];
  lines: ReturnLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lines, setLines] = useState(initialLines);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [refunded, setRefunded] = useState(0);
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [refundAccountId, setRefundAccountId] = useState<number | null>(
    accounts[0]?.id ?? null,
  );

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
        // A walk-in gets cash back, so the refund tracks the return value.
        return { ...l, qty: capped };
      }),
    );
  }

  // Keep a walk-in's refund pinned to the full value — there's no account to credit.
  // (A walk-in holds no points, so `payable` is simply the whole value.)
  const effectiveRefund = isWalkIn ? payable : refunded;

  function onSubmit() {
    if (total <= 0) return toast.error("Enter a return quantity for at least one item");
    if (effectiveRefund > payable + 0.005) {
      return toast.error(
        pointsBackValue > 0
          ? `At most ${payable.toFixed(2)} can go back in money — ${pointsBack} points return as points`
          : "Refund is more than the value of the returned goods",
      );
    }

    startTransition(async () => {
      const res = await saveSaleReturn({
        saleId,
        date,
        note: note || undefined,
        refunded: effectiveRefund,
        refundMethod,
        refundAccountId,
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
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Refund</h3>
          {isWalkIn ? (
            <p className="text-sm text-muted-foreground">
              This was a walk-in sale, so the full{" "}
              <span className="font-medium text-foreground">{payable.toFixed(2)}</span>{" "}
              goes back across the counter — there is no account to credit.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Leave at zero to credit it against what they owe instead of handing
              money back.
            </p>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Method</Label>
              <Select value={refundMethod} onValueChange={setRefundMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Account</Label>
              <Select
                value={refundAccountId ? String(refundAccountId) : undefined}
                onValueChange={(v) => setRefundAccountId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32 space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max={payable}
                className="text-right"
                value={effectiveRefund}
                disabled={isWalkIn}
                onChange={(e) => setRefunded(Number(e.target.value))}
              />
            </div>
          </div>
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
              <div className="flex justify-between border-t pt-1 text-sm font-medium">
                <span>To settle in money</span>
                <span className="tabular-nums">{payable.toFixed(2)}</span>
              </div>
            </div>
          )}
          <div className="flex justify-between py-1">
            <span className="text-sm text-muted-foreground">Refunded</span>
            <span className="text-sm tabular-nums">
              {r2(effectiveRefund).toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-sm text-muted-foreground">Credited against due</span>
            {/* `payable`, not `total` — points handed back are not money, so they
                never touch the customer's account (BLUEPRINT §15.5). */}
            <span className="text-sm tabular-nums">
              {r2(payable - effectiveRefund).toFixed(2)}
            </span>
          </div>
          <Button className="mt-2 w-full" onClick={onSubmit} disabled={pending}>
            {pending ? "Saving…" : "Save return"}
          </Button>
        </div>
      </div>
    </div>
  );
}
