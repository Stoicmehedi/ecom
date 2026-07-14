"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Tags, X } from "lucide-react";
import { toast } from "sonner";
import {
  saveAdjustment,
  deleteAdjustment,
  saveAdjustmentType,
  deleteAdjustmentType,
  searchVariants,
  type VariantHit,
} from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { qtyStep } from "@/lib/qty";

export type TypeOption = { id: number; name: string; _count: { adjustments: number } };

/** A line being counted: the variant, and what the shelf actually holds. */
type CountLine = VariantHit & { countedQty: string };

const today = () => new Date().toISOString().slice(0, 10);
const n = (s: string) => (s.trim() === "" ? NaN : Number(s));

function AdjustmentForm({ types, onDone }: { types: TypeOption[]; onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [date, setDate] = useState(today());
  const [typeId, setTypeId] = useState("");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<CountLine[]>([]);

  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [searching, startSearch] = useTransition();

  function search(value: string) {
    setTerm(value);
    if (value.trim().length < 1) {
      setHits([]);
      return;
    }
    startSearch(async () => setHits(await searchVariants(value)));
  }

  function add(hit: VariantHit) {
    setTerm("");
    setHits([]);
    if (lines.some((l) => l.variantId === hit.variantId)) return;
    // Pre-fill with what the books say: change it to what you counted. A line left
    // alone therefore changes nothing, which is the safe default.
    setLines((ls) => [...ls, { ...hit, countedQty: String(hit.stockQty) }]);
  }

  /**
   * You cannot count 4.5 shirts on a shelf (§21), so a fraction is refused as it
   * is typed. This screen deserves the strictest guard in the app: a count is not
   * derived from anything — whatever is typed *becomes* the truth.
   */
  function setCount(variantId: number, value: string) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.variantId !== variantId) return l;
        if (l.allowDecimal || value === "") return { ...l, countedQty: value };
        const parsed = Number(value);
        const whole = Number.isNaN(parsed) ? value : String(Math.round(parsed));
        return { ...l, countedQty: whole };
      }),
    );
  }

  const deltas = lines.map((l) => {
    const counted = n(l.countedQty);
    const delta = Number.isNaN(counted) ? 0 : counted - l.stockQty;
    return { ...l, delta, lossValue: -delta * l.cost };
  });

  const totalDelta = deltas.reduce((s, l) => s + l.delta, 0);
  const totalLoss = deltas.reduce((s, l) => s + l.lossValue, 0);
  const changed = deltas.filter((l) => l.delta !== 0).length;

  function onSave() {
    startTransition(async () => {
      const res = await saveAdjustment({
        date,
        adjustmentTypeId: Number(typeId),
        remark,
        items: lines.map((l) => ({ variantId: l.variantId, countedQty: n(l.countedQty) })),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Stock adjusted");
      onDone();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Reason *</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger>
              <SelectValue placeholder="Damage, loss, miscount…" />
            </SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {types.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No reasons yet — add one with the Reasons button.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="search">Find a product to count</Label>
        <div className="relative">
          <Input
            id="search"
            value={term}
            onChange={(e) => search(e.target.value)}
            placeholder="Scan a barcode, or search by name / SKU…"
            autoComplete="off"
          />
          {hits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-md">
              {hits.map((h) => (
                <li key={h.variantId}>
                  <button
                    type="button"
                    onClick={() => add(h)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span>
                      {h.label}
                      <span className="ml-2 text-xs text-muted-foreground">{h.sku}</span>
                    </span>
                    <span className="text-xs text-muted-foreground">{h.stockQty} on hand</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {searching && term && hits.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
          )}
        </div>
      </div>

      {lines.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-2 font-medium">Product</th>
                <th className="p-2 text-right font-medium">On hand</th>
                <th className="p-2 text-right font-medium">Counted</th>
                <th className="p-2 text-right font-medium">Adjustment</th>
                <th className="p-2 text-right font-medium">Loss at cost</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {deltas.map((l) => (
                <tr key={l.variantId} className="border-t">
                  <td className="p-2">
                    <p>{l.label}</p>
                    <p className="text-xs text-muted-foreground">{l.sku}</p>
                  </td>
                  <td className="p-2 text-right tabular-nums text-muted-foreground">
                    {l.stockQty}
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      step={qtyStep({ allowDecimal: l.allowDecimal })}
                      min="0"
                      className="ml-auto w-24 text-right"
                      value={l.countedQty}
                      onChange={(e) => setCount(l.variantId, e.target.value)}
                    />
                  </td>
                  <td
                    className={cn(
                      "p-2 text-right font-medium tabular-nums",
                      l.delta < 0 && "text-destructive",
                      l.delta > 0 && "text-primary",
                    )}
                  >
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {l.lossValue === 0 ? "—" : l.lossValue.toFixed(2)}
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLines((ls) => ls.filter((x) => x.variantId !== l.variantId))
                      }
                      aria-label="Remove line"
                    >
                      <X className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/30">
              <tr>
                <td className="p-2 font-medium" colSpan={3}>
                  {changed === 0
                    ? "Every count matches the books — nothing to adjust."
                    : `${changed} line(s) will change`}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {totalDelta > 0 ? `+${totalDelta.toFixed(3).replace(/\.?0+$/, "")}` : totalDelta.toFixed(3).replace(/\.?0+$/, "")}
                </td>
                <td className="p-2 text-right font-semibold tabular-nums">
                  {totalLoss.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="remark">Remark</Label>
        <Textarea
          id="remark"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          placeholder="Water damage in the back store"
          rows={2}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Type what you <strong>counted</strong>, not the difference — the adjustment is worked
        out for you, so it can never come out backwards. What is lost posts to the P&amp;L at
        cost; no cash moves.
      </p>

      <DialogFooter>
        <Button onClick={onSave} disabled={pending || !typeId || changed === 0}>
          {pending ? "Saving…" : "Adjust stock"}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function NewAdjustmentButton({ types }: { types: TypeOption[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> New adjustment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            Count what is on the shelf. The difference — and what it cost — is worked out for you.
          </DialogDescription>
        </DialogHeader>
        <AdjustmentForm types={types} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function AdjustmentRowActions({
  id,
  adjustmentNo,
}: {
  id: number;
  adjustmentNo: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onDelete() {
    if (!confirm(`Undo ${adjustmentNo}? The stock goes back to where it was.`)) return;
    startTransition(async () => {
      const res = await deleteAdjustment(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Adjustment undone");
      router.refresh();
    });
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onDelete}
      disabled={pending}
      aria-label={`Undo ${adjustmentNo}`}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

export function AdjustmentTypesButton({ types }: { types: TypeOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const res = await saveAdjustmentType({ name });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setName("");
      toast.success("Reason added");
      router.refresh();
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      const res = await deleteAdjustmentType(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Reason deleted");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags className="size-4" /> Reasons
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjustment reasons</DialogTitle>
          <DialogDescription>
            Why stock moved without being bought, sold or returned.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Damage"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) add();
            }}
          />
          <Button onClick={add} disabled={pending || !name.trim()}>
            Add
          </Button>
        </div>

        <ul className="divide-y rounded-md border">
          {types.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No reasons yet.</li>
          )}
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2">
                {t.name}
                {t._count.adjustments > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t._count.adjustments} used
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(t.id)}
                disabled={pending}
                aria-label={`Delete ${t.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
