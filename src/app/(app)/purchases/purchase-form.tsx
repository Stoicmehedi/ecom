"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { savePurchase, type PurchaseInput } from "./actions";
import { searchVariants, type VariantHit } from "./search";
import { qtyStep } from "@/lib/qty";
import { quickAddSupplier } from "../suppliers/actions";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type SupplierOption = { id: number; name: string };
export type AccountOption = { id: number; name: string };

type Line = {
  variantId: number;
  label: string;
  sku: string;
  qty: number;
  purchasePrice: number;
  /** Whether a fraction of this can be bought — a shirt's cannot (§21). */
  allowDecimal: boolean;
};

type PayLine = { method: string; accountId: number | null; amount: number };

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE", label: "Mobile banking" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

export type PurchaseFormValues = {
  id?: number;
  supplierId?: number;
  date: string;
  supplierInvoiceNo?: string;
  dueDate?: string;
  reference?: string;
  note?: string;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
  items: Line[];
  payments: PayLine[];
};

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function PurchaseForm({
  suppliers: initialSuppliers,
  accounts,
  initial,
}: {
  suppliers: SupplierOption[];
  accounts: AccountOption[];
  initial: PurchaseFormValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [suppliers, setSuppliers] = useState(initialSuppliers);
  const [supplierId, setSupplierId] = useState<number | undefined>(initial.supplierId);
  const [date, setDate] = useState(initial.date);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(initial.supplierInvoiceNo ?? "");
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [reference, setReference] = useState(initial.reference ?? "");
  const [note, setNote] = useState(initial.note ?? "");

  const [lines, setLines] = useState<Line[]>(initial.items);
  const [discountType, setDiscountType] = useState(initial.discountType);
  const [discountValue, setDiscountValue] = useState(initial.discountValue);
  const [payments, setPayments] = useState<PayLine[]>(
    initial.payments.length
      ? initial.payments
      : [{ method: "CASH", accountId: accounts[0]?.id ?? null, amount: 0 }],
  );

  // --- product search ---
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const res = await searchVariants(query);
      if (!cancelled) {
        setHits(res);
        setOpen(true);
        setSearching(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function addLine(hit: VariantHit) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === hit.variantId);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], qty: round2(next[i].qty + 1) };
        return next;
      }
      return [
        ...prev,
        {
          variantId: hit.variantId,
          label: hit.label,
          sku: hit.sku,
          qty: 1,
          purchasePrice: hit.purchasePrice,
          allowDecimal: hit.allowDecimal,
        },
      ];
    });
    setQuery("");
    setHits([]);
    setOpen(false);
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.purchasePrice, 0));
  const discount =
    discountType === "PERCENT"
      ? round2(Math.min((subtotal * discountValue) / 100, subtotal))
      : round2(Math.min(discountValue, subtotal));
  const total = round2(subtotal - discount);
  const paid = round2(payments.reduce((s, p) => s + (p.amount || 0), 0));
  const due = round2(total - paid);

  // --- quick-add supplier ---
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  async function onQuickAdd() {
    const res = await quickAddSupplier(newName, newPhone);
    if (res.error || !res.id) {
      toast.error(res.error ?? "Failed to add supplier");
      return;
    }
    setSuppliers((prev) =>
      [...prev, { id: res.id!, name: newName.trim() }].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    );
    setSupplierId(res.id);
    setNewName("");
    setNewPhone("");
    setAddOpen(false);
    toast.success("Supplier added");
  }

  function onSubmit() {
    if (!supplierId) return toast.error("Pick a supplier");
    if (lines.length === 0) return toast.error("Add at least one product");
    if (lines.some((l) => l.qty <= 0)) return toast.error("Quantity must be greater than zero");
    if (paid > total + 0.005) return toast.error("Paid amount is more than the total");

    const input: PurchaseInput = {
      id: initial.id,
      supplierId,
      date,
      supplierInvoiceNo: supplierInvoiceNo || undefined,
      dueDate: dueDate || undefined,
      reference: reference || undefined,
      note: note || undefined,
      discountType,
      discountValue,
      items: lines.map((l) => ({
        variantId: l.variantId,
        qty: l.qty,
        purchasePrice: l.purchasePrice,
      })),
      payments: payments
        .filter((p) => p.amount > 0)
        .map((p) => ({ method: p.method, accountId: p.accountId, amount: p.amount })),
    };

    startTransition(async () => {
      const res = await savePurchase(input);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(initial.id ? "Purchase updated" : "Purchase recorded — stock updated");
      router.push("/purchases");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border p-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>Supplier *</Label>
            <div className="flex gap-2">
              <Select
                value={supplierId ? String(supplierId) : undefined}
                onValueChange={(v) => setSupplierId(Number(v))}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Add supplier"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="date">Purchase date *</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="supplierInvoiceNo">Supplier invoice no.</Label>
            <Input
              id="supplierInvoiceNo"
              value={supplierInvoiceNo}
              onChange={(e) => setSupplierInvoiceNo(e.target.value)}
              placeholder="Their invoice number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dueDate">Payment due date</Label>
            <Input
              id="dueDate"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reference">Reference</Label>
            <Input
              id="reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
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
      </div>

      {/* Items */}
      <div className="rounded-lg border">
        <div className="border-b p-4" ref={boxRef}>
          <Label htmlFor="search" className="mb-2 block">
            Add products
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              className="pl-9"
              placeholder="Search by product name, SKU, or scan a barcode…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => hits.length && setOpen(true)}
              autoComplete="off"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
            {open && hits.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-md">
                {hits.map((h) => (
                  <li key={h.variantId}>
                    <button
                      type="button"
                      onClick={() => addLine(h)}
                      className="flex w-full items-center justify-between rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span>
                        <span className="font-medium">{h.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{h.sku}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        in stock {h.stockQty}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {open && !searching && query.trim() && hits.length === 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-3 text-sm text-muted-foreground shadow-md">
                No matching product.
              </div>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="w-32 text-right">Quantity</TableHead>
              <TableHead className="w-36 text-right">Purchase price</TableHead>
              <TableHead className="w-32 text-right">Subtotal</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No products yet. Search above to add one.
                </TableCell>
              </TableRow>
            )}
            {lines.map((l, i) => (
              <TableRow key={l.variantId}>
                <TableCell>
                  <span className="font-medium">{l.label}</span>
                  <span className="block text-xs text-muted-foreground">{l.sku}</span>
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step={qtyStep({ allowDecimal: l.allowDecimal })}
                    min="0"
                    className="text-right"
                    value={l.qty}
                    onChange={(e) =>
                      updateLine(i, {
                        // A shirt cannot be bought in halves either (§21).
                        qty: l.allowDecimal
                          ? Number(e.target.value)
                          : Math.round(Number(e.target.value)),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right"
                    value={l.purchasePrice}
                    onChange={(e) =>
                      updateLine(i, { purchasePrice: Number(e.target.value) })
                    }
                  />
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {round2(l.qty * l.purchasePrice).toFixed(2)}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totals + payment */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Payment</h3>
          {payments.map((p, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Method</Label>
                <Select
                  value={p.method}
                  onValueChange={(v) =>
                    setPayments((prev) =>
                      prev.map((x, idx) => (idx === i ? { ...x, method: v } : x)),
                    )
                  }
                >
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
                  value={p.accountId ? String(p.accountId) : undefined}
                  onValueChange={(v) =>
                    setPayments((prev) =>
                      prev.map((x, idx) =>
                        idx === i ? { ...x, accountId: Number(v) } : x,
                      ),
                    )
                  }
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
                  className="text-right"
                  value={p.amount}
                  onChange={(e) =>
                    setPayments((prev) =>
                      prev.map((x, idx) =>
                        idx === i ? { ...x, amount: Number(e.target.value) } : x,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove payment"
                disabled={payments.length === 1}
                onClick={() => setPayments((prev) => prev.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPayments((prev) => [
                  ...prev,
                  { method: "CASH", accountId: accounts[0]?.id ?? null, amount: 0 },
                ])
              }
            >
              <Plus className="size-4" />
              Split payment
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setPayments((prev) =>
                  prev.map((x, idx) =>
                    idx === 0 ? { ...x, amount: Math.max(total - (paid - (prev[0].amount || 0)), 0) } : x,
                  ),
                )
              }
            >
              Pay full
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border p-4">
          <h3 className="font-medium">Summary</h3>
          <Row label="Subtotal" value={subtotal.toFixed(2)} />

          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-sm text-muted-foreground">Discount</span>
            <div className="flex items-center gap-2">
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as "AMOUNT" | "PERCENT")}
              >
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AMOUNT">Amount</SelectItem>
                  <SelectItem value="PERCENT">Percent</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.01"
                min="0"
                className="w-24 text-right"
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
              />
              <span className="w-20 text-right text-sm tabular-nums">
                −{discount.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="border-t pt-2">
            <Row label="Total" value={total.toFixed(2)} strong />
            <Row label="Paid" value={paid.toFixed(2)} />
            <Row
              label="Due"
              value={due.toFixed(2)}
              strong
              className={due > 0 ? "text-destructive" : "text-primary"}
            />
          </div>

          <Button className="mt-2 w-full" onClick={onSubmit} disabled={pending}>
            {pending
              ? "Saving…"
              : initial.id
                ? "Update purchase"
                : "Save purchase & add stock"}
          </Button>
        </div>
      </div>

      {/* Quick-add supplier */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qa-name">Name *</Label>
              <Input
                id="qa-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-phone">Phone *</Label>
              <Input
                id="qa-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" onClick={onQuickAdd}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  className = "",
}: {
  label: string;
  value: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={`tabular-nums ${strong ? "text-base font-semibold" : "text-sm"} ${className}`}
      >
        {value}
      </span>
    </div>
  );
}
