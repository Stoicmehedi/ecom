import { PageHeader } from "@/components/app/page-header";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getCatalogOptions } from "../_data";
import { ProductForm } from "../product-form";

export default async function NewProductPage() {
  const session = await auth();
  if (!hasPermission(session, "products.manage")) redirect("/dashboard");
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
