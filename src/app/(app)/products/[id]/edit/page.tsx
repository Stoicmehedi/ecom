import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/app/page-header";
import { getCatalogOptions } from "../../_data";
import { ProductForm, type ProductFormData } from "../../product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const productId = Number(id);
  if (!Number.isFinite(productId)) notFound();

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      variants: { orderBy: [{ sortIndex: "asc" }, { id: "asc" }] },
      attributes: { select: { id: true } },
      colors: { select: { id: true } },
    },
  });
  if (!product) notFound();

  const options = await getCatalogOptions();

  const data: ProductFormData = {
    id: product.id,
    name: product.name,
    code: product.code,
    description: product.description,
    type: product.type,
    categoryId: product.categoryId,
    brandId: product.brandId,
    unitId: product.unitId,
    imageUrl: product.imageUrl,
    isActive: product.isActive,
    alertQty: product.alertQty != null ? String(product.alertQty) : null,
    minSalePrice: product.minSalePrice != null ? String(product.minSalePrice) : null,
    attributeCategoryId: product.attributeCategoryId,
    attributeIds: product.attributes.map((a) => a.id),
    colorIds: product.colors.map((c) => c.id),
    variants: product.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku,
      barcode: v.barcode,
      attributeId: v.attributeId,
      colorId: v.colorId,
      purchasePrice: String(v.purchasePrice),
      sellingPrice: String(v.sellingPrice),
      discountType: v.discountType,
      discountValue: String(v.discountValue),
      wholesalePrice: v.wholesalePrice != null ? String(v.wholesalePrice) : null,
      wholesaleQty: v.wholesaleQty != null ? String(v.wholesaleQty) : null,
      stockQty: String(v.stockQty),
    })),
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader title="Edit product" description={product.name} />
      <ProductForm product={data} {...options} />
    </div>
  );
}
