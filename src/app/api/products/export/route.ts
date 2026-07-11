import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCsv } from "@/lib/reports/export";
import { toDateStr } from "@/lib/reports/range";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The catalogue as CSV — one row per variant.
 *
 * The columns are exactly the ones the importer reads back, so an export is a
 * valid import: pull the catalogue down, edit it in a spreadsheet, push it back.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const q = req.nextUrl.searchParams;
  const term = (q.get("q") ?? "").trim();
  const categoryId = Number(q.get("categoryId")) || undefined;
  const brandId = Number(q.get("brandId")) || undefined;
  const status = q.get("status");

  const where: Prisma.ProductWhereInput = {
    ...(categoryId ? { categoryId } : {}),
    ...(brandId ? { brandId } : {}),
    ...(status === "active"
      ? { isActive: true }
      : status === "inactive"
        ? { isActive: false }
        : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { code: { contains: term, mode: "insensitive" } },
            { variants: { some: { sku: { contains: term, mode: "insensitive" } } } },
            { variants: { some: { barcode: { contains: term, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }],
    include: {
      category: { select: { name: true } },
      brand: { select: { name: true } },
      unit: { select: { name: true } },
      attributeCategory: { select: { name: true } },
      variants: {
        orderBy: [{ sortIndex: "asc" }, { id: "asc" }],
        include: {
          attribute: { select: { name: true, attributeCategory: { select: { name: true } } } },
          color: { select: { name: true } },
        },
      },
    },
  });

  const rows = products.flatMap((p) =>
    p.variants.map((v) => ({
      sku: v.sku,
      name: p.name,
      code: p.code ?? "",
      category: p.category?.name ?? "",
      brand: p.brand?.name ?? "",
      unit: p.unit?.name ?? "",
      variant: v.label ?? "",
      // The axis travels with the value, so "M" reimports as a Size and not a Fit.
      axis: v.attribute?.attributeCategory.name ?? p.attributeCategory?.name ?? "",
      size: v.attribute?.name ?? "",
      color: v.color?.name ?? "",
      barcode: v.barcode ?? "",
      cost: Number(v.purchasePrice),
      price: Number(v.sellingPrice),
      discountType: v.discountType,
      discountValue: Number(v.discountValue),
      wholesalePrice: v.wholesalePrice == null ? "" : Number(v.wholesalePrice),
      wholesaleQty: v.wholesaleQty == null ? "" : Number(v.wholesaleQty),
      minSalePrice: p.minSalePrice == null ? "" : Number(p.minSalePrice),
      alertQty: p.alertQty == null ? "" : Number(p.alertQty),
      stock: Number(v.stockQty),
      active: p.isActive ? "yes" : "no",
    })),
  );

  const csv = toCsv({
    title: "Products",
    columns: [
      { key: "sku", label: "sku" },
      { key: "name", label: "name" },
      { key: "code", label: "code" },
      { key: "category", label: "category" },
      { key: "brand", label: "brand" },
      { key: "unit", label: "unit" },
      { key: "variant", label: "variant" },
      { key: "axis", label: "axis" },
      { key: "size", label: "size" },
      { key: "color", label: "color" },
      { key: "barcode", label: "barcode" },
      { key: "cost", label: "cost", type: "money" },
      { key: "price", label: "price", type: "money" },
      { key: "discountType", label: "discount_type" },
      { key: "discountValue", label: "discount_value", type: "money" },
      { key: "wholesalePrice", label: "wholesale_price", type: "money" },
      { key: "wholesaleQty", label: "wholesale_qty", type: "qty" },
      { key: "minSalePrice", label: "min_sale_price", type: "money" },
      { key: "alertQty", label: "alert_qty", type: "qty" },
      // Stock is exported for reference but the importer will NOT write it —
      // stock moves through purchases, sales and returns, never a spreadsheet.
      { key: "stock", label: "stock_readonly", type: "qty" },
      { key: "active", label: "active" },
    ],
    rows,
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="products-${toDateStr(new Date())}.csv"`,
    },
  });
}
