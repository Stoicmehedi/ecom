import { prisma } from "@/lib/prisma";
import { isValidEan13 } from "@/lib/barcode";

async function main() {
  const p = await prisma.product.findFirst({
    where: { name: "Field Tee" },
    include: {
      variants: { include: { attribute: true, color: true }, orderBy: { id: "asc" } },
      attributes: true,
      colors: true,
    },
  });
  if (!p) throw new Error("Field Tee not found");
  console.log("product:", { id: p.id, type: p.type, minSalePrice: String(p.minSalePrice), alertQty: String(p.alertQty), attrs: p.attributes.map(a=>a.name), colors: p.colors.map(c=>c.name) });
  for (const v of p.variants) {
    console.log(
      String(v.id).padStart(4),
      (v.label ?? "").padEnd(12),
      v.sku.padEnd(16),
      (v.barcode ?? "none").padEnd(15),
      isValidEan13(v.barcode ?? "") ? "EAN13 ok" : "BAD",
      "sell", String(v.sellingPrice),
      "wsale", String(v.wholesalePrice), "@", String(v.wholesaleQty),
      "stock", String(v.stockQty),
      "attr", v.attribute?.name ?? "-", "color", v.color?.name ?? "-",
    );
  }
  const bad = p.variants.filter((v) => !isValidEan13(v.barcode ?? ""));
  console.log(bad.length === 0 ? "\nALL BARCODES VALID EAN-13" : `\n${bad.length} BAD BARCODES`);
}
main().finally(() => prisma.$disconnect());
