"use client";

import { selectId } from "@/lib/select";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Lock, Wand2, ArrowDownToLine, Tag, Palette, Coins } from "lucide-react";
import { toast } from "sonner";
import { saveProduct, type ProductInput } from "./actions";
import { CategoryCascade, type Cat } from "./category-cascade";
import { priceLine } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/image-upload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  imageKey: string | null;
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
  const [imageKey, setImageKey] = useState<string | null>(product?.imageKey ?? null);
  const [isActive, setIsActive] = useState(product?.isActive ?? true);
  const [alertQty, setAlertQty] = useState(product?.alertQty ?? "");
  const [minSalePrice, setMinSalePrice] = useState(product?.minSalePrice ?? "");
  const [error, setError] = useState<string | null>(null);
  // Flip on the first failed submit, so required-field warnings appear only
  // after someone tries to save — not while they are still filling the form in.
  const [showErrors, setShowErrors] = useState(false);

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

    // Required for our application: name, category, unit, and a selling price on
    // every variant. Blocked here for an instant, specific message; the server
    // re-checks all four, so this is a courtesy, not the guarantee.
    const fail = (m: string) => {
      setShowErrors(true);
      setError(m);
      toast.error(m);
    };
    if (!name.trim()) return fail("Enter a product name.");
    if (categoryId == null) return fail("Choose a category.");
    if (unitId === "none") return fail("Choose a unit.");
    const priceless = rows.find((r) => !(numOf(r.sellingPrice) > 0));
    if (priceless) {
      return fail(
        `Enter a selling price${priceless.label ? ` for ${priceless.label}` : ""}.`,
      );
    }

    const payload: ProductInput = {
      id: product?.id,
      name,
      code: code || undefined,
      description: description || undefined,
      type,
      categoryId,
      brandId: brandId === "none" ? null : Number(brandId),
      unitId: unitId === "none" ? null : Number(unitId),
      imageKey,
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
    <form onSubmit={onSubmit}>
      {/* pb clears the floating action bar, so nothing hides behind it. */}
      <div className="space-y-6 pb-24">
      {/* ---------------------------------------------------------- basics */}
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <Tag className="size-4 text-muted-foreground" />
          Details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2 sm:col-span-2 xl:col-span-2">
            <Label htmlFor="name">
              Name <span className="text-destructive">*</span>
            </Label>
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

          <div className="space-y-2 sm:col-span-2 xl:col-span-3">
            <Label>
              Category <span className="text-destructive">*</span>
            </Label>
            <CategoryCascade
              categories={categories}
              value={categoryId}
              onChange={setCategoryId}
            />
            {showErrors && categoryId == null && (
              <p className="text-xs text-destructive">Pick a category.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Brand</Label>
            <Select value={brandId} onValueChange={(v) => v && setBrandId(v)}>
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
            <Label>
              Unit <span className="text-destructive">*</span>
            </Label>
            <Select value={unitId} onValueChange={(v) => v && setUnitId(v)}>
              <SelectTrigger
                className={cn(
                  showErrors && unitId === "none" && "border-destructive",
                )}
              >
                <SelectValue placeholder="Select a unit" />
              </SelectTrigger>
              <SelectContent>
                {units.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {showErrors && unitId === "none" && (
              <p className="text-xs text-destructive">Pick a unit.</p>
            )}
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
            <ImageUpload
              folder="products"
              value={imageKey}
              onChange={setImageKey}
              label="Photo"
              hint="Shows on the product list and on the POS tile. Up to 2 MB."
            />
          </div>

          <div className="space-y-2 sm:col-span-2 xl:col-span-3">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="optional"
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-3 sm:col-span-2 xl:col-span-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                When on, the product sells at the POS. Turn off to retire it.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Active" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- generator */}
      {isVariable && (
        <section className="rounded-lg border bg-card p-5 shadow-sm">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <Palette className="size-4 text-muted-foreground" />
              Options
            </h2>
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
                  const id = selectId(v);
                  if (id === undefined) return;
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
      <section className="rounded-lg border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Coins className="size-4 text-muted-foreground" />
            {isVariable ? "Variants" : "Price & stock"}
          </h2>
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

        {/* A spreadsheet-style grid: bordered cells, a header band, and fields
            that fill their cell (their own borders removed) so each value reads
            in its own box. `divide-*` draws the single lines between cells. */}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground [&>th]:whitespace-nowrap [&>th]:border-r [&>th]:px-3 [&>th]:py-2.5 [&>th:last-child]:border-r-0">
                {isVariable && <th>Variant</th>}
                <th>SKU</th>
                <th>Barcode</th>
                <th>Cost</th>
                <th>
                  Selling <span className="text-destructive">*</span>
                </th>
                <th>Discount</th>
                <th>Sells at</th>
                <th>Wholesale</th>
                <th>at qty</th>
                <th>Opening</th>
                {isVariable && <th aria-label="Remove" />}
              </tr>
            </thead>
            <tbody className="[&>tr]:border-b [&>tr:last-child]:border-b-0">
              {rows.map((r) => {
                const p = priceLine({
                  sellingPrice: numOf(r.sellingPrice),
                  discountType: r.discountType,
                  discountValue: numOf(r.discountValue),
                  minSalePrice: floor,
                  qty: 1,
                });
                return (
                  <tr
                    key={r.key}
                    className="[&>td]:border-r [&>td:last-child]:border-r-0"
                  >
                    {isVariable && (
                      <td className="p-0">
                        <input
                          value={r.label}
                          onChange={(e) => updateRow(r.key, { label: e.target.value })}
                          placeholder="e.g. Red / L"
                          className={CELL_FIELD}
                        />
                      </td>
                    )}
                    <td className="p-0">
                      <input
                        value={r.sku}
                        onChange={(e) => updateRow(r.key, { sku: e.target.value })}
                        placeholder="auto"
                        className={CELL_FIELD}
                      />
                    </td>
                    <td className="p-0">
                      <input
                        value={r.barcode}
                        onChange={(e) => updateRow(r.key, { barcode: e.target.value })}
                        placeholder="auto EAN-13"
                        className={CELL_FIELD}
                      />
                    </td>
                    <td className="p-0">
                      <NumBox
                        value={r.purchasePrice}
                        onChange={(v) => updateRow(r.key, { purchasePrice: v })}
                      />
                    </td>
                    <td className="p-0">
                      <NumBox
                        value={r.sellingPrice}
                        onChange={(v) => updateRow(r.key, { sellingPrice: v })}
                        invalid={showErrors && !(numOf(r.sellingPrice) > 0)}
                      />
                    </td>
                    <td className="p-0">
                      <div className="flex h-10 items-stretch">
                        <select
                          value={r.discountType}
                          onChange={(e) =>
                            updateRow(r.key, {
                              discountType: e.target.value as "AMOUNT" | "PERCENT",
                            })
                          }
                          className="border-0 border-r bg-transparent pl-3 pr-1 text-xs outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
                          aria-label="Discount type"
                        >
                          <option value="AMOUNT">−</option>
                          <option value="PERCENT">%</option>
                        </select>
                        <NumBox
                          value={r.discountValue}
                          onChange={(v) => updateRow(r.key, { discountValue: v })}
                          className="px-2"
                        />
                      </div>
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 tabular-nums",
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
                    <td className="p-0">
                      <NumBox
                        value={r.wholesalePrice}
                        onChange={(v) => updateRow(r.key, { wholesalePrice: v })}
                      />
                    </td>
                    <td className="p-0">
                      <NumBox
                        value={r.wholesaleQty}
                        onChange={(v) => updateRow(r.key, { wholesaleQty: v })}
                      />
                    </td>
                    <td className="p-0">
                      {r.locked ? (
                        <div
                          className="flex h-10 items-center gap-1 px-3 text-xs text-muted-foreground"
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
                      <td className="p-0 text-center">
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

      </div>

      {/* Floating action bar — always in reach on this tall form. Sits within the
          centred container and lifts off the content with a shadow. */}
      <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-lg border bg-card/95 px-4 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <p className="min-w-0 truncate text-sm">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <span className="text-muted-foreground">
              {product ? "Editing this product" : "New product"}
            </span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/products")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : product ? "Save changes" : "Create product"}
          </Button>
        </div>
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

/**
 * A borderless field that fills its grid cell — the cell's own border is the
 * boundary, so the Price & stock table reads as one clean spreadsheet rather
 * than a scatter of separate boxes. Focus shows an inset ring inside the cell.
 */
const CELL_FIELD =
  "h-10 w-full min-w-0 border-0 bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60";

function NumBox({
  value,
  onChange,
  className,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  invalid?: boolean;
}) {
  return (
    <input
      type="number"
      min="0"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="0"
      className={cn(
        CELL_FIELD,
        "tabular-nums",
        invalid && "relative z-10 bg-destructive/5 ring-2 ring-inset ring-destructive/60",
        className,
      )}
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
