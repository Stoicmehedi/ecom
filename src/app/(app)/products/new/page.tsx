import { PageHeader } from "@/components/app/page-header";
import { getCatalogOptions } from "../_data";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const options = await getCatalogOptions();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        title="New product"
        description="Add a product to your catalog."
      />
      <ProductForm {...options} />
    </div>
  );
}
