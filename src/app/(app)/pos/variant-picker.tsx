"use client";

import { useMemo, useState } from "react";
import type { PosHit, PosProduct } from "./search";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Pick a variant of a product that has more than one.
 *
 * When the product varies along both axes we lay it out as a size × colour grid,
 * because that is the shape of the shelf the cashier is looking at. Anything
 * else — one axis, or free-text labels typed by hand — falls back to a plain
 * list, which is still one tap.
 *
 * Out-of-stock variants are shown and disabled rather than hidden: "we don't
 * have that size" is an answer the cashier needs to be able to give.
 */
export function VariantPicker({
  product,
  onPick,
  onClose,
}: {
  product: PosProduct | null;
  onPick: (v: PosHit) => void;
  onClose: () => void;
}) {
  const grid = useMemo(() => {
    if (!product) return null;
    const vs = product.variants;
    // Only a real matrix earns the matrix layout: every variant must sit on both
    // axes, or the grid would have holes that mean nothing.
    if (!vs.every((v) => v.attribute && v.color)) return null;
    const sizes = [...new Set(vs.map((v) => v.attribute!))];
    const colors = [...new Set(vs.map((v) => v.color!))];
    if (sizes.length < 2 && colors.length < 2) return null;

    const at = new Map(vs.map((v) => [`${v.attribute}|${v.color}`, v]));
    const hex = new Map(vs.map((v) => [v.color!, v.colorHex]));
    return { sizes, colors, at, hex };
  }, [product]);

  return (
    <Dialog open={product != null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{product?.name}</DialogTitle>
          <DialogDescription>
            {grid
              ? "Pick a size and colour."
              : `Pick one of ${product?.variants.length} options.`}
          </DialogDescription>
        </DialogHeader>

        {product && grid && (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th />
                  {grid.colors.map((c) => (
                    <th key={c} className="pb-1 text-xs font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-3 rounded-full border"
                          style={{ background: grid.hex.get(c) ?? "transparent" }}
                        />
                        {c}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.sizes.map((s) => (
                  <tr key={s}>
                    <th className="pr-2 text-right text-xs font-medium text-muted-foreground">
                      {s}
                    </th>
                    {grid.colors.map((c) => {
                      const v = grid.at.get(`${s}|${c}`);
                      const out = !v || v.stockQty <= 0;
                      return (
                        <td key={c}>
                          <button
                            type="button"
                            disabled={out}
                            onClick={() => v && onPick(v)}
                            className={cn(
                              "w-full rounded-md border p-2 text-center transition",
                              out
                                ? "cursor-not-allowed border-dashed opacity-50"
                                : "hover:border-primary hover:bg-accent",
                            )}
                          >
                            <span className="block font-semibold tabular-nums">
                              {v ? v.price.toFixed(2) : "—"}
                            </span>
                            <span
                              className={cn(
                                "block text-xs tabular-nums",
                                out ? "text-destructive" : "text-muted-foreground",
                              )}
                            >
                              {!v ? "none" : out ? "out" : `${v.stockQty} left`}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {product && !grid && (
          <div className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
            {product.variants.map((v) => {
              const out = v.stockQty <= 0;
              return (
                <button
                  key={v.variantId}
                  type="button"
                  disabled={out}
                  onClick={() => onPick(v)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    out
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-primary hover:bg-accent",
                  )}
                >
                  <p className="text-sm font-medium">{v.variantLabel ?? v.sku}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{v.sku}</p>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="font-semibold tabular-nums">
                      {v.price.toFixed(2)}
                    </span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        out ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      {out ? "out of stock" : `${v.stockQty} left`}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A helper the picker exists to serve: is there actually a choice to make? */
export function needsPicker(p: PosProduct): boolean {
  return p.variants.length > 1;
}
