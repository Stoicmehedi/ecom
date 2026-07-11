"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Lock, Wand2, ArrowDownToLine } from "lucide-react";
import { toast } from "sonner";
import { saveProduct, type ProductInput } from "./actions";
import { CategoryCascade, type Cat } from "./category-cascade";
import { priceLine } from "@/lib/pricing";
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
import { cn } from "@/lib/utils";

type Option = { id: number; name: string };
export type AxisOption = {
  id: number;
  name: string;
  attributes: { id: number; name: string }[];
};
export type ColorOption = { id: number; name: string; hex: string | null };

type VariantRow = {
  key: string;
  id?: number;
  label: string;
  sku: string;
  barcode: string;
  attributeId: number | null;
  colorId: number | null;
  purchasePrice: string;
  sellingPrice: string;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: string;
  wholesalePrice: string;
  wholesaleQty: string;
  openingStock: string;
  /** True once the variant exists in the DB — its stock can't be re-entered. */
  locked?: boolean;
};

export type ProductFormData = {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  type: "SIMPLE" | "VARIABLE";
  categoryId: number | null;
  brandId: number | null;
  unitId: number | null;
  imageUrl: string | null;
  isActive: boolean;
  alertQty: string | null;
  minSalePrice: string | null;
  attributeCategoryId: number | null;
  attributeIds: number[];
  colorIds: number[];
  variants: {
    id: number;
    label: string | null;
    sku: string;
    barcode: string | null;
    attributeId: number | null;
    colorId: number | null;
    purchasePrice: string;
    sellingPrice: string;
    discountType: "AMOUNT" | "PERCENT";
    discountValue: string;
    wholesalePrice: string | null;
    wholesaleQty: string | null;
    stockQty: string;
  }[];
};

function emptyRow(key: string): VariantRow {
  return {
    key,
    label: "",
    sku: "",
    barcode: "",
    attributeId: null,
    colorId: null,
    purchasePrice: "",
    sellingPrice: "",
    discountType: "AMOUNT",
    discountValue: "",
    wholesalePrice: "",
    wholesaleQty: "",
    openingStock: "",
  };
}

const numOf = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function ProductForm({
  product,
  categories,
  brands,
  units,
  axes,
  colors,
}: {
  product?: ProductFormData;
  categories: Cat[];
  brands: Option[];
  units: Option[];
  axes: AxisOption[];
  colors: ColorOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const keyCounter = useRef(0);
  const nextKey = () => `v${keyCounter.current++}`;

  const [name, setName] = useState(product?.name ?? "");
  const [code, setCode] = useState(product?.code ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [type, setType] = useState<"SIMPLE" | "VARIABLE">(product?.type ?? "SIMPLE");
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
  const [alertQty, setAlertQty] = useState(product?.alertQty ?? "");
  const [minSalePrice, setMinSalePrice] = useState(product?.minSalePrice ?? "");
  const [error, setError] = useState<string | null>(null);

  // --- the axes this product varies along
  const [axisId, setAxisId] = useState<number | null>(
    product?.attributeCategoryId ?? null,
  );
  const [pickedAttrs, setPickedAttrs] = useState<number[]>(product?.attributeIds ?? []);
  const [pickedColors, setPickedColors] = useState<number[]>(product?.colorIds ?? []);

  const [variants, setVariants] = useState<VariantRow[]>(() => {
    if (product && product.variants.length) {
      return product.variants.map((v) => ({
        key: nextKey(),
        id: v.id,
        label: v.label ?? "",
        sku: v.sku,
        barcode: v.barcode ?? "",
        attributeId: v.attributeId,
        colorId: v.colorId,
        purchasePrice: v.purchasePrice,
        sellingPrice: v.sellingPrice,
        discountType: v.discountType,
        discountValue: v.discountValue,
        wholesalePrice: v.wholesalePrice ?? "",
        wholesaleQty: v.wholesaleQty ?? "",
        openingStock: "",
        locked: true,
      }));
    }
    return [emptyRow(nextKey())];
  });

  // --- bulk fill
  const [bulk, setBulk] = useState({
    purchasePrice: "",
    sellingPrice: "",
    discountValue: "",
    wholesalePrice: "",
    wholesaleQty: "",
    openingStock: "",
  });

  const isVariable = type === "VARIABLE";
  const rows = isVariable ? variants : variants.slice(0, 1);

  const axis = useMemo(() => axes.find((a) => a.id === axisId), [axes, axisId]);
  const attrById = useMemo(() => {
    const m = new Map<number, string>();
    for (const a of axes) for (const v of a.attributes) m.set(v.id, v.name);
    return m;
  }, [axes]);
  const colorById = useMemo(
    () => new Map(colors.map((c) => [c.id, c.name])),
    [colors],
  );

  function updateRow(key: string, patch: Partial<VariantRow>) {
    setVariants((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setVariants((prev) => [...prev, emptyRow(nextKey())]);
  }
  function removeRow(key: string) {
    setVariants((prev) => prev.filter((r) => r.key !== key));
  }

  /**
   * Cross the picked values with the picked colours.
   *
   * A combination that already exists is KEPT exactly as it is — its prices, its
   * stock and its history stay put. Only genuinely new combinations are added.
   * Combinations no longer picked are dropped from the form, and the server
   * refuses to delete any of those that has been bought or sold.
   */
  function generate() {
    if (!axisId && pickedColors.length === 0) {
      toast.error("Pick some sizes or colours first.");
      return;
    }

    const attrs: (number | null)[] = pickedAttrs.length ? pickedAttrs : [null];
    const cols: (number | null)[] = pickedColors.length ? pickedColors : [null];

    const existing = new Map(
      variants.map((v) => [`${v.attributeId ?? ""}|${v.colorId ?? ""}`, v]),
    );

    const next: VariantRow[] = [];
    for (const a of attrs) {
      for (const c of cols) {
        const key = `${a ?? ""}|${c ?? ""}`;
        const found = existing.get(key);
        if (found) {
          next.push(found);
          continue;
        }
        const label = [a ? attrById.get(a) : null, c ? colorById.get(c) : null]
          .filter(Boolean)
          .join(" / ");
        next.push({
          ...emptyRow(nextKey()),
          label,
          attributeId: a,
          colorId: c,
          // A fresh row inherits the first row's pricing — you almost never want
          // to retype the same price for every size.
          purchasePrice: variants[0]?.purchasePrice ?? "",
          sellingPrice: variants[0]?.sellingPrice ?? "",
        });
      }
    }

    const kept = next.filter((r) => r.id).length;
    const added = next.length - kept;
    setVariants(next);
    toast.success(
      `${next.length} variant${next.length === 1 ? "" : "s"}` +
        (kept ? ` · ${kept} kept` : "") +
        (added ? ` · ${added} new` : ""),
    );
  }

  /** Push a value down every row — the antidote to typing one price 24 times. */
  function applyToAll() {
    const filled = Object.entries(bulk).filter(([, v]) => v !== "");
    if (filled.length === 0) {
      toast.error("Type a value to push down first.");
      return;
    }
    setVariants((prev) =>
      prev.map((r) => {
        const patch: Partial<VariantRow> = {};
        for (const [k, v] of filled) {
          // Opening stock can't be rewritten on a variant that already exists.
          if (k === "openingStock" && r.locked) continue;
          patch[k as keyof typeof bulk] = v;
        }
        return { ...r, ...patch };
      }),
    );
    toast.success("Applied to every variant.");
  }

  function toggle(list: number[], id: number, set: (v: number[]) => void) {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: ProductInput = {
      id: product?.id,
      name,
      code: code || undefined,
      description: description || undefined,
      type,
      categoryId,
      brandId: brandId === "none" ? null : Number(brandId),
      unitId: unitId === "none" ? null : Number(unitId),
      imageUrl: imageUrl || null,
      isActive,
      alertQty: alertQty === "" ? null : numOf(alertQty),
      minSalePrice: minSalePrice === "" ? null : numOf(minSalePrice),
      attributeCategoryId: isVariable ? axisId : null,
      attributeIds: isVariable ? pickedAttrs : [],
      colorIds: isVariable ? pickedColors : [],
      variants: rows.map((r) => ({
        id: r.id,
        sku: r.sku || undefined,
        barcode: r.barcode || undefined,
        label: r.label || undefined,
        attributeId: r.attributeId,
        colorId: r.colorId,
        purchasePrice: numOf(r.purchasePrice),
        sellingPrice: numOf(r.sellingPrice),
        discountType: r.discountType,
        discountValue: numOf(r.discountValue),
        wholesalePrice: r.wholesalePrice === "" ? null : numOf(r.wholesalePrice),
        wholesaleQty: r.wholesaleQty === "" ? null : numOf(r.wholesaleQty),
        openingStock: r.locked ? undefined : numOf(r.openingStock),
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

  const floor = minSalePrice === "" ? null : numOf(minSalePrice);

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* ---------------------------------------------------------- basics */}
      <section className="rounded-lg border p-5">
        <h2 className="mb-4 font-medium">Product</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cotton T-Shirt"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Product code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="optional"
            />
          </div>

          <div className="space-y-2 md:col-span-3">
            <Label>Category</Label>
            <CategoryCascade
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
            />
          </div>

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
                <SelectItem value="SIMPLE">Simple — one variant</SelectItem>
                <SelectItem value="VARIABLE">Variable — sizes / colours</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="alertQty">Alert quantity</Label>
            <Input
              id="alertQty"
              type="number"
              min="0"
              step="any"
              value={alertQty}
              onChange={(e) => setAlertQty(e.target.value)}
              placeholder="default"
            />
            <p className="text-xs text-muted-foreground">
              Flag as low stock at or below this. Blank uses the shop default.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="minSalePrice">Minimum sale price</Label>
            <Input
              id="minSalePrice"
              type="number"
              min="0"
              step="0.01"
              value={minSalePrice}
              onChange={(e) => setMinSalePrice(e.target.value)}
              placeholder="no floor"
            />
            <p className="text-xs text-muted-foreground">
              Checkout <span className="font-medium">refuses</span> to sell below this.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL</Label>
            <Input
              id="imageUrl"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>

          <div className="space-y-2 md:col-span-3">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="optional"
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 accent-primary"
            />
            Active — sells at the POS
          </label>
        </div>
      </section>

      {/* ------------------------------------------------------- generator */}
      {isVariable && (
        <section className="rounded-lg border p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="font-medium">What does it vary by?</h2>
            <Button type="button" variant="secondary" onClick={generate}>
              <Wand2 className="size-4" />
              Generate variants
            </Button>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Pick the sizes and colours, then generate — one variant per combination.
            Variants you already have keep their prices, stock and history.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Axis</Label>
              <Select
                value={axisId ? String(axisId) : "none"}
                onValueChange={(v) => {
                  const id = v === "none" ? null : Number(v);
                  setAxisId(id);
                  setPickedAttrs([]); // values belong to an axis; changing it clears them
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (colour only)</SelectItem>
                  {axes.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {axis && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {axis.attributes.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      This axis has no values yet — add some under Attributes &amp;
                      colours.
                    </p>
                  )}
                  {axis.attributes.map((v) => (
                    <Chip
                      key={v.id}
                      on={pickedAttrs.includes(v.id)}
                      onClick={() => toggle(pickedAttrs, v.id, setPickedAttrs)}
                    >
                      {v.name}
                    </Chip>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Colours</Label>
              <div className="flex flex-wrap gap-1.5">
                {colors.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No colours defined yet.
                  </p>
                )}
                {colors.map((c) => (
                  <Chip
                    key={c.id}
                    on={pickedColors.includes(c.id)}
                    onClick={() => toggle(pickedColors, c.id, setPickedColors)}
                  >
                    {c.hex && (
                      <span
                        className="size-3 rounded-full border"
                        style={{ background: c.hex }}
                      />
                    )}
                    {c.name}
                  </Chip>
                ))}
              </div>
            </div>
          </div>

          {(pickedAttrs.length > 0 || pickedColors.length > 0) && (
            <p className="mt-4 rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {Math.max(pickedAttrs.length, 1) * Math.max(pickedColors.length, 1)}{" "}
              combination
              {Math.max(pickedAttrs.length, 1) * Math.max(pickedColors.length, 1) === 1
                ? ""
                : "s"}{" "}
              selected.
            </p>
          )}
        </section>
      )}

      {/* -------------------------------------------------------- variants */}
      <section className="rounded-lg border p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium">{isVariable ? "Variants" : "Price & stock"}</h2>
          {isVariable && (
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus className="size-4" />
              Add a row by hand
            </Button>
          )}
        </div>

        {isVariable && rows.length > 1 && (
          <div className="mb-4 rounded-md border border-dashed p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <ArrowDownToLine className="size-4" />
              Apply to all
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
              <BulkBox
                label="Cost"
                value={bulk.purchasePrice}
                onChange={(v) => setBulk({ ...bulk, purchasePrice: v })}
              />
              <BulkBox
                label="Selling"
                value={bulk.sellingPrice}
                onChange={(v) => setBulk({ ...bulk, sellingPrice: v })}
              />
              <BulkBox
                label="Discount"
                value={bulk.discountValue}
                onChange={(v) => setBulk({ ...bulk, discountValue: v })}
              />
              <BulkBox
                label="Wholesale"
                value={bulk.wholesalePrice}
                onChange={(v) => setBulk({ ...bulk, wholesalePrice: v })}
              />
              <BulkBox
                label="W. qty"
                value={bulk.wholesaleQty}
                onChange={(v) => setBulk({ ...bulk, wholesaleQty: v })}
              />
              <BulkBox
                label="Opening"
                value={bulk.openingStock}
                onChange={(v) => setBulk({ ...bulk, openingStock: v })}
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={applyToAll}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[70rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {isVariable && <th className="pb-2 pr-2 font-medium">Variant</th>}
                <th className="pb-2 pr-2 font-medium">SKU</th>
                <th className="pb-2 pr-2 font-medium">Barcode</th>
                <th className="pb-2 pr-2 text-right font-medium">Cost</th>
                <th className="pb-2 pr-2 text-right font-medium">Selling</th>
                <th className="pb-2 pr-2 text-right font-medium">Discount</th>
                <th className="pb-2 pr-2 text-right font-medium">Sells at</th>
                <th className="pb-2 pr-2 text-right font-medium">Wholesale</th>
                <th className="pb-2 pr-2 text-right font-medium">at qty</th>
                <th className="pb-2 pr-2 text-right font-medium">Opening</th>
                {isVariable && <th className="pb-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = priceLine({
                  sellingPrice: numOf(r.sellingPrice),
                  discountType: r.discountType,
                  discountValue: numOf(r.discountValue),
                  minSalePrice: floor,
                  qty: 1,
                });
                return (
                  <tr key={r.key} className="border-b last:border-0">
                    {isVariable && (
                      <td className="py-2 pr-2">
                        <Input
                          value={r.label}
                          onChange={(e) => updateRow(r.key, { label: e.target.value })}
                          placeholder="e.g. Red / L"
                          className="h-8 w-32"
                        />
                      </td>
                    )}
                    <td className="py-2 pr-2">
                      <Input
                        value={r.sku}
                        onChange={(e) => updateRow(r.key, { sku: e.target.value })}
                        placeholder="auto-generated"
                        className="h-8 w-36"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        value={r.barcode}
                        onChange={(e) => updateRow(r.key, { barcode: e.target.value })}
                        placeholder="auto EAN-13"
                        className="h-8 w-36"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <NumBox
                        value={r.purchasePrice}
                        onChange={(v) => updateRow(r.key, { purchasePrice: v })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <NumBox
                        value={r.sellingPrice}
                        onChange={(v) => updateRow(r.key, { sellingPrice: v })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <div className="flex justify-end gap-1">
                        <select
                          value={r.discountType}
                          onChange={(e) =>
                            updateRow(r.key, {
                              discountType: e.target.value as "AMOUNT" | "PERCENT",
                            })
                          }
                          className="h-8 rounded-md border bg-transparent px-1 text-xs"
                        >
                          <option value="AMOUNT">−</option>
                          <option value="PERCENT">%</option>
                        </select>
                        <NumBox
                          value={r.discountValue}
                          onChange={(v) => updateRow(r.key, { discountValue: v })}
                          className="w-16"
                        />
                      </div>
                    </td>
                    <td
                      className={cn(
                        "py-2 pr-2 text-right tabular-nums",
                        p.belowMin && "font-medium text-destructive",
                      )}
                      title={
                        p.belowMin
                          ? `Below the ${floor} floor — checkout will refuse this.`
                          : undefined
                      }
                    >
                      {p.price.toFixed(2)}
                    </td>
                    <td className="py-2 pr-2">
                      <NumBox
                        value={r.wholesalePrice}
                        onChange={(v) => updateRow(r.key, { wholesalePrice: v })}
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <NumBox
                        value={r.wholesaleQty}
                        onChange={(v) => updateRow(r.key, { wholesaleQty: v })}
                        className="w-16"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      {r.locked ? (
                        <div
                          className="flex items-center justify-end gap-1 text-xs text-muted-foreground"
                          title="Stock moves through purchases, sales and returns — not by editing it here."
                        >
                          <Lock className="size-3" />
                          via stock
                        </div>
                      ) : (
                        <NumBox
                          value={r.openingStock}
                          onChange={(v) => updateRow(r.key, { openingStock: v })}
                        />
                      )}
                    </td>
                    {isVariable && (
                      <td className="py-2 text-right">
                        {rows.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Remove variant"
                            onClick={() => removeRow(r.key)}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {floor != null && rows.some((r) => {
          const p = priceLine({
            sellingPrice: numOf(r.sellingPrice),
            discountType: r.discountType,
            discountValue: numOf(r.discountValue),
            minSalePrice: floor,
            qty: 1,
          });
          return p.belowMin;
        }) && (
          <p className="mt-3 text-sm text-destructive">
            One or more variants sell below the {floor.toFixed(2)} floor. Checkout will
            refuse them — raise the price, cut the discount, or lower the floor.
          </p>
        )}
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

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function NumBox({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Input
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      className={cn("h-8 w-20 text-right", className)}
    />
  );
}

function BulkBox({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="h-8"
      />
    </div>
  );
}
