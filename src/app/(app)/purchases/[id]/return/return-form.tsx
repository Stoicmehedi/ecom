"use client";

import { selectId } from "@/lib/select";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { savePurchaseReturn } from "./actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReturnLine = {
  purchaseItemId: number;
  label: string;
  sku: string;
  price: number;
  purchasedQty: number;
  returnedQty: number;
  inStock: number;
  qty: number;
};

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE", label: "Mobile banking" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank transfer" },
];

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function ReturnForm({
  purchaseId,
  purchaseNo,
  supplierName,
  returnTypes,
  accounts,
  lines: initialLines,
}: {
  purchaseId: number;
  purchaseNo: string;
  supplierName: string;
  returnTypes: { id: number; name: string }[];
  accounts: { id: number; name: string }[];
  lines: ReturnLine[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [lines, setLines] = useState(initialLines);
  const [returnTypeId, setReturnTypeId] = useState<number | undefined>();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [refunded, setRefunded] = useState(0);
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [refundAccountId, setRefundAccountId] = useState<number | null>(
    accounts[0]?.id ?? null,
  );

  const total = round2(lines.reduce((s, l) => s + l.qty * l.price, 0));

  /** You can't return more than is left on the line, nor more than you still hold. */
  function maxFor(l: ReturnLine) {
    return Math.max(0, Math.min(l.purchasedQty - l.returnedQty, l.inStock));
  }

  function setQty(i: number, value: number) {
    setLines((prev) =>
      prev.map((l, idx) =>
        idx === i ? { ...l, qty: Math.max(0, Math.min(value, maxFor(l))) } : l,
      ),
    );
  }

  function onSubmit() {
    if (!returnTypeId) return toast.error("Pick a return reason");
    if (total <= 0) return toast.error("Enter a return quantity for at least one item");
    if (refunded > total + 0.005)
      return toast.error("Refund is more than the value of the returned goods");

    startTransition(async () => {
      const res = await savePurchaseReturn({
        purchaseId,
        returnTypeId,
        date,
        note: note || undefined,
        refunded,
        refundMethod,
        refundAccountId,
        items: lines
          .filter((l) => l.qty > 0)
          .map((l) => ({ purchaseItemId: l.purchaseItemId, qty: l.qty })),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Return recorded — stock reduced");
      router.push("/purchase-returns");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label>Supplier</Label>
          <Input value={supplierName} disabled />
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
          <Label>Reason *</Label>
          <Select
            value={returnTypeId ? String(returnTypeId) : undefined}
            onValueChange={(v) => { const id = selectId(v, []); if (id) setReturnTypeId(id); }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Why is it going back?" />
            </SelectTrigger>
            <SelectContent>
              {returnTypes.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              <TableHead className="text-right">Purchased</TableHead>
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
                <TableRow key={l.purchaseItemId}>
                  <TableCell>
                    <span className="font-medium">{l.label}</span>
                    <span className="block text-xs text-muted-foreground">{l.sku}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.purchasedQty}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {l.returnedQty || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {max}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      max={max}
                      className="text-right"
                      value={l.qty}
                      disabled={max <= 0}
                      onChange={(e) => setQty(i, Number(e.target.value))}
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {round2(l.qty * l.price).toFixed(2)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Refund received</h3>
          <p className="text-sm text-muted-foreground">
            Leave at zero if the supplier is crediting your account instead of
            handing money back.
          </p>
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
                onValueChange={(v) => { const id = selectId(v, []); if (id) setRefundAccountId(id); }}
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
                max={total}
                className="text-right"
                value={refunded}
                onChange={(e) => setRefunded(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Summary</h3>
          <div className="flex justify-between py-1 text-sm">
            <span className="text-muted-foreground">Against</span>
            <span>{purchaseNo}</span>
          </div>
          <div className="flex justify-between border-t py-1 pt-2">
            <span className="text-sm text-muted-foreground">Return value</span>
            <span className="text-base font-semibold tabular-nums">
              {total.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-sm text-muted-foreground">Refunded in cash</span>
            <span className="text-sm tabular-nums">{round2(refunded).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-sm text-muted-foreground">Credited against due</span>
            <span className="text-sm tabular-nums">
              {round2(total - refunded).toFixed(2)}
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
