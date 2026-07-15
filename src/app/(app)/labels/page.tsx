import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { CatalogTabs } from "@/components/app/catalog-tabs";
import { num } from "@/lib/format";
import { LabelsClient, type LabelVariant } from "./labels-client";

export default async function LabelsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!hasPermission(session, "products.view")) redirect("/dashboard");
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const productId = Number(one(params.productId)) || undefined;

  const [variants, branch] = await Promise.all([
    prisma.productVariant.findMany({
      orderBy: [{ productId: "asc" }, { sortIndex: "asc" }, { id: "asc" }],
      include: { product: { select: { name: true } } },
    }),
    prisma.branch.findFirst({ select: { name: true } }),
  ]);

  const rows: LabelVariant[] = variants.map((v) => ({
    id: v.id,
    name: v.label ? `${v.product.name} — ${v.label}` : v.product.name,
    sku: v.sku,
    barcode: v.barcode,
    price: num(v.sellingPrice),
  }));

  // Coming from a product's "Print labels" action pre-loads that product's variants.
  const preselected = productId
    ? variants.filter((v) => v.productId === productId && v.barcode).map((v) => v.id)
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <PageHeader
        eyebrow="Catalogue"
        title="Barcode labels"
        description="Print shelf and price labels. Barcodes are EAN-13 and scan as they are."
      />
      <CatalogTabs />

      <LabelsClient
        variants={rows}
        storeName={branch?.name ?? "MPoS"}
        preselected={preselected}
      />
    </div>
  );
}
