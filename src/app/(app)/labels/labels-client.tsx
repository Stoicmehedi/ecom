"use client";

import { useMemo, useState } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ean13Svg, isValidEan13 } from "@/lib/barcode";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export type LabelVariant = {
  id: number;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
};

export function LabelsClient({
  variants,
  storeName,
  preselected,
}: {
  variants: LabelVariant[];
  storeName: string;
  preselected: number[];
}) {
  const [qtys, setQtys] = useState<Record<number, number>>(() =>
    Object.fromEntries(preselected.map((id) => [id, 1])),
  );
  const [showPrice, setShowPrice] = useState(true);
  const [showName, setShowName] = useState(true);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return variants;
    return variants.filter(
      (v) =>
        v.name.toLowerCase().includes(t) ||
        v.sku.toLowerCase().includes(t) ||
        (v.barcode ?? "").includes(t),
    );
  }, [variants, q]);

  const setQty = (id: number, n: number) =>
    setQtys((prev) => {
      const next = { ...prev };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(n, 200);
      return next;
    });

  // One entry per label to be printed — a variant with qty 3 appears three times.
  const sheet = useMemo(() => {
    const out: LabelVariant[] = [];
    for (const v of variants) {
      const n = qtys[v.id] ?? 0;
      for (let i = 0; i < n; i++) out.push(v);
    }
    return out;
  }, [variants, qtys]);

  const totalLabels = sheet.length;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .label-sheet, .label-sheet * { visibility: visible !important; }
          .label-sheet {
            position: absolute; left: 0; top: 0; width: 100%;
            margin: 0; padding: 0; border: none !important; gap: 0 !important;
          }
          .no-print { display: none !important; }
          .label { break-inside: avoid; border: none !important; }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>

      <div className="no-print space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-64 flex-1 space-y-1">
            <Label htmlFor="lq">Find a product</Label>
            <Input
              id="lq"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, SKU or barcode…"
            />
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showName}
                onChange={(e) => setShowName(e.target.checked)}
                className="size-4 accent-primary"
              />
              Name
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
                className="size-4 accent-primary"
              />
              Price
            </label>
            <Button onClick={() => window.print()} disabled={totalLabels === 0}>
              <Printer className="size-4" />
              Print {totalLabels || ""}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Product</th>
                <th className="p-2 font-medium">SKU</th>
                <th className="p-2 font-medium">Barcode</th>
                <th className="p-2 text-right font-medium">Price</th>
                <th className="w-32 p-2 text-right font-medium">Labels</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-muted-foreground">
                    Nothing matches.
                  </td>
                </tr>
              )}
              {filtered.map((v) => (
                <tr key={v.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{v.name}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{v.sku}</td>
                  <td
                    className={cn(
                      "p-2 font-mono text-xs",
                      v.barcode ? "text-muted-foreground" : "text-destructive",
                    )}
                  >
                    {v.barcode ?? "no barcode"}
                  </td>
                  <td className="p-2 text-right tabular-nums">{money(v.price)}</td>
                  <td className="p-2">
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        min="0"
                        max="200"
                        className="h-8 w-20 text-right"
                        value={qtys[v.id] ?? ""}
                        placeholder="0"
                        disabled={!v.barcode}
                        onChange={(e) => setQty(v.id, Number(e.target.value))}
                      />
                      {qtys[v.id] ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label="Clear"
                          onClick={() => setQty(v.id, 0)}
                        >
                          <X className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalLabels === 0 && (
          <p className="text-sm text-muted-foreground">
            Set a quantity against a product to add labels to the sheet.
          </p>
        )}
      </div>

      {totalLabels > 0 && (
        <div className="label-sheet mt-6 flex flex-wrap gap-2">
          {sheet.map((v, i) => (
            <div
              key={`${v.id}-${i}`}
              className="label flex w-[48mm] flex-col items-center rounded border p-1 text-center"
            >
              {showName && (
                <p className="w-full truncate text-[9px] font-semibold leading-tight text-black">
                  {v.name}
                </p>
              )}
              <p className="text-[8px] leading-tight text-black">{storeName}</p>
              {v.barcode && isValidEan13(v.barcode) ? (
                <div
                  className="w-full"
                  // The SVG is generated from the code itself — no image hosting,
                  // and it stays crisp at any label size.
                  dangerouslySetInnerHTML={{
                    __html: ean13Svg(v.barcode, { width: 1.3, height: 34, fontSize: 8 }),
                  }}
                />
              ) : (
                <p className="py-2 font-mono text-[9px] text-black">{v.barcode}</p>
              )}
              {showPrice && (
                <p className="text-[11px] font-bold leading-tight text-black">
                  {money(v.price)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
