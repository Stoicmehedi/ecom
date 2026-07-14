import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { ImportForm } from "./import-form";

export default async function ImportProductsPage() {
  const session = await auth();
  if (!hasPermission(session, "products.manage")) redirect("/dashboard");

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Import products"
        description="Load a catalogue from a spreadsheet. Nothing is written until you say so."
      >
        <Button variant="outline" asChild>
          <Link href="/products">
            <ArrowLeft className="size-4" />
            Back to products
          </Link>
        </Button>
      </PageHeader>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">The SKU is the key.</p>
        <p className="mt-1 text-muted-foreground">
          A row whose SKU already exists <span className="font-medium">updates</span>{" "}
          that variant; a new SKU <span className="font-medium">creates</span> one. Rows
          sharing a product name join the same product, so extra sizes of an existing
          shirt land where you would expect. Missing barcodes are generated.
        </p>
        <p className="mt-2 text-muted-foreground">
          Required columns: <code className="font-mono">sku</code>,{" "}
          <code className="font-mono">name</code>, <code className="font-mono">price</code>.
          Optional: code, category, brand, unit, variant, axis, size, color, barcode, cost,
          discount_type, discount_value, wholesale_price, wholesale_qty, min_sale_price,
          alert_qty, active.
        </p>
        <p className="mt-2 text-muted-foreground">
          A <code className="font-mono">size</code> with no{" "}
          <code className="font-mono">axis</code> beside it is filed under{" "}
          <span className="font-medium">Size</span>. Sizes and colours the file names but
          the shop doesn&apos;t have yet are created, so a whole clothing catalogue loads
          in one pass.
        </p>
      </div>

      <ImportForm />
    </div>
  );
}
