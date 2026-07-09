"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Lock } from "lucide-react";
import { toast } from "sonner";
import { saveProduct, type ProductInput } from "./actions";
import { CategoryCascade, type Cat } from "./category-cascade";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: number; name: string };

type VariantRow = {
  key: string;
  id?: number;
  label: string;
  sku: string;
  barcode: string;
  purchasePrice: string;
  sellingPrice: string;
  wholesalePrice: string;
  openingStock: string;
};

export type ProductFormData = {
  id: number;
  name: string;
  type: "SIMPLE" | "VARIABLE";
  categoryId: number | null;
  brandId: number | null;
  unitId: number | null;
  imageUrl: string | null;
  isActive: boolean;
  variants: {
    id: number;
    label: string | null;
    sku: string;
    barcode: string | null;
    purchasePrice: string;
    sellingPrice: string;
    wholesalePrice: string | null;
    stockQty: string;
  }[];
};

function emptyRow(key: string): VariantRow {
  return {
    key,
    label: "",
    sku: "",
    barcode: "",
    purchasePrice: "",
    sellingPrice: "",
    wholesalePrice: "",
    openingStock: "",
  };
}

export function ProductForm({
  product,
  categories,
  brands,
  units,
}: {
  product?: ProductFormData;
  categories: Cat[];
  brands: Option[];
  units: Option[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const keyCounter = useRef(0);
  const nextKey = () => `v${keyCounter.current++}`;

  const [name, setName] = useState(product?.name ?? "");
  const [type, setType] = useState<"SIMPLE" | "VARIABLE">(
    product?.type ?? "SIMPLE",
  );
  const [categoryId, setCategoryId] = useState<number | null>(
    product?.categoryId ?? null,
  );
  const [brandId, setBrandId] = useState(
    product?.brandId ? String(product.brandId) : "none",
  );
  const [unitId, setUnitId] = useState(
    product?.unitId ? String(product.unitId) : "none",
  );
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);

  const [variants, setVariants] = useState<VariantRow[]>(() => {
    if (product && product.variants.length) {
      return product.variants.map((v) => ({
        key: nextKey(),
        id: v.id,
        label: v.label ?? "",
        sku: v.sku,
        barcode: v.barcode ?? "",
        purchasePrice: v.purchasePrice,
        sellingPrice: v.sellingPrice,
        wholesalePrice: v.wholesalePrice ?? "",
        openingStock: "",
      }));
    }
    return [emptyRow(nextKey())];
  });

  const isVariable = type === "VARIABLE";
  const rows = isVariable ? variants : variants.slice(0, 1);

  function updateRow(key: string, patch: Partial<VariantRow>) {
    setVariants((prev) =>
      prev.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  }

  function addRow() {
    setVariants((prev) => [...prev, emptyRow(nextKey())]);
  }

  function removeRow(key: string) {
    setVariants((prev) => prev.filter((r) => r.key !== key));
  }

  function num(v: string): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: ProductInput = {
      id: product?.id,
      name,
      type,
      categoryId: categoryId,
      brandId: brandId === "none" ? null : Number(brandId),
      unitId: unitId === "none" ? null : Number(unitId),
      imageUrl: imageUrl.trim() || null,
      isActive,
      variants: rows.map((r) => ({
        id: r.id,
        label: isVariable ? r.label : undefined,
        sku: r.sku,
        barcode: r.barcode,
        purchasePrice: num(r.purchasePrice),
        sellingPrice: num(r.sellingPrice),
        wholesalePrice: r.wholesalePrice ? num(r.wholesalePrice) : null,
        openingStock: r.id ? undefined : num(r.openingStock),
      })),
    };

    startTransition(async () => {
      const res = await saveProduct(payload);
      if (res.ok) {
        toast.success(product ? "Product updated" : "Product created");
        router.push("/products");
        router.refresh();
      } else {
        setError(res.error ?? "Failed to save");
        toast.error(res.error ?? "Failed to save");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Details */}
      <section className="space-y-4 rounded-lg border p-5">
        <h2 className="text-sm font-medium text-muted-foreground">Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Product name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cotton T-Shirt"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as "SIMPLE" | "VARIABLE")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SIMPLE">Simple</SelectItem>
                <SelectItem value="VARIABLE">Variable (variants)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <CategoryCascade
            categories={categories}
            value={product?.categoryId ?? null}
            onChange={setCategoryId}
          />

          <div className="space-y-2">
            <Label>Brand</Label>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {brands.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger>
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="imageUrl">Image URL (optional)</Label>
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 accent-primary"
            />
            Active
          </label>
        </div>
      </section>

      {/* Variants */}
      <section className="space-y-4 rounded-lg border p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-muted-foreground">
              {isVariable ? "Variants" : "Pricing & stock"}
            </h2>
            {isVariable && (
              <p className="text-xs text-muted-foreground">
                Each variant has its own SKU, price and stock.
              </p>
            )}
          </div>
          {isVariable && (
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              Add variant
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {rows.map((r, i) => (
            <div
              key={r.key}
              className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3"
            >
              {isVariable && (
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs">Variant label</Label>
                  <Input
                    value={r.label}
                    onChange={(e) => updateRow(r.key, { label: e.target.value })}
                    placeholder="e.g. Red / L"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">SKU (optional)</Label>
                <Input
                  value={r.sku}
                  onChange={(e) => updateRow(r.key, { sku: e.target.value })}
                  placeholder="auto-generated"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Barcode (optional)</Label>
                <Input
                  value={r.barcode}
                  onChange={(e) => updateRow(r.key, { barcode: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Purchase price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.purchasePrice}
                  onChange={(e) =>
                    updateRow(r.key, { purchasePrice: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Selling price</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.sellingPrice}
                  onChange={(e) =>
                    updateRow(r.key, { sellingPrice: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Wholesale (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={r.wholesalePrice}
                  onChange={(e) =>
                    updateRow(r.key, { wholesalePrice: e.target.value })
                  }
                  placeholder="0.00"
                />
              </div>
              {r.id ? (
                <div className="flex items-end text-xs text-muted-foreground">
                  <Lock className="mr-1 size-3" />
                  Stock managed via purchases
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs">Opening stock</Label>
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    value={r.openingStock}
                    onChange={(e) =>
                      updateRow(r.key, { openingStock: e.target.value })
                    }
                    placeholder="0"
                  />
                </div>
              )}

              {isVariable && rows.length > 1 && !r.id && (
                <div className="flex items-end lg:col-span-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(r.key)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                    Remove variant
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : product ? "Save changes" : "Create product"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/products")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
