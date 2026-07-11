"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { makeEan13 } from "@/lib/barcode";
import type { Prisma } from "@/generated/prisma/client";

export type ImportRow = {
  line: number;
  sku: string;
  name: string;
  code?: string;
  category?: string;
  brand?: string;
  unit?: string;
  variant?: string;
  axis?: string;
  size?: string;
  color?: string;
  barcode?: string;
  cost: number;
  price: number;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
  wholesalePrice: number | null;
  wholesaleQty: number | null;
  minSalePrice: number | null;
  alertQty: number | null;
  active: boolean;
};

export type ImportPreview = {
  rows: (ImportRow & { action: "create" | "update"; problem?: string })[];
  creates: number;
  updates: number;
  problems: number;
  /** Masters the import would have to create. Named, so nothing appears by surprise. */
  newCategories: string[];
  newBrands: string[];
  newUnits: string[];
  newAttributes: string[];
  newColors: string[];
};

export type ImportResult = { ok?: boolean; error?: string; created?: number; updated?: number };

// --------------------------------------------------------------- CSV parsing

/** A CSV parser that understands quotes — a product called `Shirt, Blue` is normal. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const src = text.replace(/^﻿/, ""); // strip the BOM Excel adds

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

/** A size with no axis named against it has to belong somewhere. */
const DEFAULT_AXIS = "Size";

const numOrNull = (s: string | undefined): number | null => {
  const t = (s ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/** Read the CSV and say exactly what would happen — writing nothing. */
export async function previewImport(csv: string): Promise<ImportPreview | { error: string }> {
  const table = parseCsv(csv);
  if (table.length < 2) return { error: "That file has no rows." };

  const header = table[0].map((h) => h.trim().toLowerCase());
  const need = ["sku", "name", "price"];
  const missing = need.filter((h) => !header.includes(h));
  if (missing.length) {
    return { error: `The file is missing required column(s): ${missing.join(", ")}.` };
  }

  const col = (name: string) => header.indexOf(name);
  const at = (r: string[], name: string) => {
    const i = col(name);
    return i === -1 ? undefined : r[i]?.trim();
  };

  const [existing, categories, brands, units, attributes, colors] = await Promise.all([
    prisma.productVariant.findMany({ select: { sku: true } }),
    prisma.category.findMany({ select: { name: true } }),
    prisma.brand.findMany({ select: { name: true } }),
    prisma.unit.findMany({ select: { name: true } }),
    prisma.attribute.findMany({
      select: { name: true, attributeCategory: { select: { name: true } } },
    }),
    prisma.color.findMany({ select: { name: true } }),
  ]);
  const known = new Set(existing.map((v) => v.sku.toLowerCase()));
  const lower = (xs: { name: string }[]) => new Set(xs.map((x) => x.name.toLowerCase()));
  const knownCats = lower(categories);
  const knownBrands = lower(brands);
  const knownUnits = lower(units);
  const knownColors = lower(colors);
  // An attribute is only the same one if it sits on the same axis: "M" the Size
  // and "M" the Fit are different values.
  const knownAttrs = new Set(
    attributes.map((a) => `${a.attributeCategory.name.toLowerCase()}|${a.name.toLowerCase()}`),
  );

  const rows: ImportPreview["rows"] = [];
  const seen = new Set<string>();
  const newCategories = new Set<string>();
  const newBrands = new Set<string>();
  const newUnits = new Set<string>();
  const newAttributes = new Set<string>();
  const newColors = new Set<string>();

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    const sku = (at(r, "sku") ?? "").trim();
    const name = (at(r, "name") ?? "").trim();
    const price = numOrNull(at(r, "price"));

    let problem: string | undefined;
    if (!sku) problem = "no SKU";
    else if (!name) problem = "no name";
    else if (price == null) problem = "price isn't a number";
    else if (seen.has(sku.toLowerCase())) problem = "duplicate SKU in this file";

    const dtRaw = (at(r, "discount_type") ?? "AMOUNT").toUpperCase();
    const row: ImportRow & { action: "create" | "update"; problem?: string } = {
      line,
      sku,
      name,
      code: at(r, "code") || undefined,
      category: at(r, "category") || undefined,
      brand: at(r, "brand") || undefined,
      unit: at(r, "unit") || undefined,
      variant: at(r, "variant") || undefined,
      axis: at(r, "axis") || undefined,
      size: at(r, "size") || undefined,
      color: at(r, "color") || undefined,
      barcode: at(r, "barcode") || undefined,
      cost: numOrNull(at(r, "cost")) ?? 0,
      price: price ?? 0,
      discountType: dtRaw === "PERCENT" ? "PERCENT" : "AMOUNT",
      discountValue: numOrNull(at(r, "discount_value")) ?? 0,
      wholesalePrice: numOrNull(at(r, "wholesale_price")),
      wholesaleQty: numOrNull(at(r, "wholesale_qty")),
      minSalePrice: numOrNull(at(r, "min_sale_price")),
      alertQty: numOrNull(at(r, "alert_qty")),
      active: (at(r, "active") ?? "yes").toLowerCase() !== "no",
      action: known.has(sku.toLowerCase()) ? "update" : "create",
      problem,
    };

    if (!problem) {
      seen.add(sku.toLowerCase());
      if (row.category && !knownCats.has(row.category.toLowerCase()))
        newCategories.add(row.category);
      if (row.brand && !knownBrands.has(row.brand.toLowerCase()))
        newBrands.add(row.brand);
      if (row.unit && !knownUnits.has(row.unit.toLowerCase())) newUnits.add(row.unit);
      if (row.size) {
        const axis = row.axis || DEFAULT_AXIS;
        const key = `${axis.toLowerCase()}|${row.size.toLowerCase()}`;
        if (!knownAttrs.has(key)) newAttributes.add(`${axis}: ${row.size}`);
      }
      if (row.color && !knownColors.has(row.color.toLowerCase())) newColors.add(row.color);
    }
    rows.push(row);
  }

  const good = rows.filter((r) => !r.problem);
  return {
    rows,
    creates: good.filter((r) => r.action === "create").length,
    updates: good.filter((r) => r.action === "update").length,
    problems: rows.length - good.length,
    newCategories: [...newCategories],
    newBrands: [...newBrands],
    newUnits: [...newUnits],
    newAttributes: [...newAttributes],
    newColors: [...newColors],
  };
}

/**
 * Apply the import. Rows with problems are skipped, never guessed at.
 *
 * Stock is deliberately NOT importable: it moves through purchases, sales and
 * returns, each of which carries a cost and an audit trail. Letting a spreadsheet
 * set it would put stock on the shelf that nothing ever paid for.
 */
export async function runImport(csv: string): Promise<ImportResult> {
  const preview = await previewImport(csv);
  if ("error" in preview) return { error: preview.error };

  const rows = preview.rows.filter((r) => !r.problem);
  if (rows.length === 0) return { error: "Nothing importable in that file." };

  let created = 0;
  let updated = 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        const catCache = new Map<string, number>();
        const brandCache = new Map<string, number>();
        const unitCache = new Map<string, number>();

        const findOrCreate = async (
          kind: "category" | "brand" | "unit",
          name: string,
          cache: Map<string, number>,
        ): Promise<number> => {
          const key = name.toLowerCase();
          const hit = cache.get(key);
          if (hit) return hit;

          let id: number;
          if (kind === "category") {
            const found = await tx.category.findFirst({ where: { name } });
            id = found
              ? found.id
              : (await tx.category.create({ data: { name, level: 1 } })).id;
          } else if (kind === "brand") {
            const found = await tx.brand.findFirst({ where: { name } });
            id = found ? found.id : (await tx.brand.create({ data: { name } })).id;
          } else {
            const found = await tx.unit.findFirst({ where: { name } });
            id = found ? found.id : (await tx.unit.create({ data: { name } })).id;
          }
          cache.set(key, id);
          return id;
        };

        const axisCache = new Map<string, number>();
        const attrCache = new Map<string, number>();
        const colorCache = new Map<string, number>();

        /** The axis a size hangs off — created if the spreadsheet names a new one. */
        const axisId = async (name: string): Promise<number> => {
          const key = name.toLowerCase();
          const hit = axisCache.get(key);
          if (hit) return hit;
          const found = await tx.attributeCategory.findFirst({ where: { name } });
          const id = found ? found.id : (await tx.attributeCategory.create({ data: { name } })).id;
          axisCache.set(key, id);
          return id;
        };

        const attributeId = async (axis: string, value: string): Promise<number> => {
          const key = `${axis.toLowerCase()}|${value.toLowerCase()}`;
          const hit = attrCache.get(key);
          if (hit) return hit;
          const attributeCategoryId = await axisId(axis);
          const found = await tx.attribute.findFirst({
            where: { attributeCategoryId, name: value },
          });
          const id = found
            ? found.id
            : (await tx.attribute.create({ data: { attributeCategoryId, name: value } })).id;
          attrCache.set(key, id);
          return id;
        };

        const colorId = async (name: string): Promise<number> => {
          const key = name.toLowerCase();
          const hit = colorCache.get(key);
          if (hit) return hit;
          const found = await tx.color.findFirst({ where: { name } });
          const id = found ? found.id : (await tx.color.create({ data: { name } })).id;
          colorCache.set(key, id);
          return id;
        };

        for (const r of rows) {
          const categoryId = r.category
            ? await findOrCreate("category", r.category, catCache)
            : null;
          const brandId = r.brand ? await findOrCreate("brand", r.brand, brandCache) : null;
          const unitId = r.unit ? await findOrCreate("unit", r.unit, unitCache) : null;

          const attrId = r.size ? await attributeId(r.axis || DEFAULT_AXIS, r.size) : null;
          const colId = r.color ? await colorId(r.color) : null;
          const axis = r.size ? await axisId(r.axis || DEFAULT_AXIS) : null;

          const productData = {
            name: r.name,
            code: r.code ?? null,
            isActive: r.active,
            minSalePrice: r.minSalePrice,
            alertQty: r.alertQty,
            ...(categoryId ? { categoryId } : {}),
            ...(brandId ? { brandId } : {}),
            ...(unitId ? { unitId } : {}),
            ...(axis ? { attributeCategoryId: axis } : {}),
          } satisfies Prisma.ProductUncheckedUpdateInput;

          const variantData = {
            label: r.variant ?? null,
            purchasePrice: r.cost,
            sellingPrice: r.price,
            discountType: r.discountType,
            discountValue: r.discountValue,
            wholesalePrice: r.wholesalePrice,
            wholesaleQty: r.wholesaleQty,
            attributeId: attrId,
            colorId: colId,
          };

          /**
           * The product carries the union of the axes its variants use — that is
           * what the variant generator reads back, so an imported catalogue can be
           * extended in the editor instead of only in a spreadsheet.
           */
          const linkAxes = (productId: number) =>
            tx.product.update({
              where: { id: productId },
              data: {
                ...(attrId ? { attributes: { connect: { id: attrId } } } : {}),
                ...(colId ? { colors: { connect: { id: colId } } } : {}),
              },
            });

          const existing = await tx.productVariant.findUnique({
            where: { sku: r.sku },
            select: { id: true, productId: true, barcode: true },
          });

          if (existing) {
            await tx.productVariant.update({
              where: { id: existing.id },
              data: {
                ...variantData,
                ...(r.barcode ? { barcode: r.barcode } : {}),
              },
            });
            await tx.product.update({
              where: { id: existing.productId },
              data: productData,
            });
            if (attrId || colId) await linkAxes(existing.productId);
            updated++;
            continue;
          }

          // A new SKU joins an existing product of the same name if there is one —
          // that is how "one more size of the same shirt" arrives from a spreadsheet.
          const variable = Boolean(r.variant || r.size || r.color);
          const product =
            (await tx.product.findFirst({ where: { name: r.name } })) ??
            (await tx.product.create({
              data: { ...productData, type: variable ? "VARIABLE" : "SIMPLE" },
            }));
          if (attrId || colId) await linkAxes(product.id);

          const variant = await tx.productVariant.create({
            data: {
              ...variantData,
              productId: product.id,
              sku: r.sku,
              barcode: r.barcode || null,
              stockQty: 0, // never from a spreadsheet
            },
          });

          if (!variant.barcode) {
            await tx.productVariant.update({
              where: { id: variant.id },
              data: { barcode: makeEan13(variant.id) },
            });
          }
          created++;
        }
      },
      { timeout: 60_000 },
    );
  } catch {
    return { error: "The import failed and nothing was changed." };
  }

  revalidatePath("/products");
  revalidatePath("/inventory");
  return { ok: true, created, updated };
}
