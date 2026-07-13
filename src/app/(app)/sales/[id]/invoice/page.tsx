import { notFound } from "next/navigation";
import { loadInvoice, shareText } from "@/lib/invoice";
import { A4Invoice } from "@/components/invoice/invoice-doc";
import { InvoiceActions } from "./invoice-actions";

/**
 * The A4 invoice — the document a customer can be handed, or that becomes a PDF
 * through the browser's own Print → Save as PDF (§20.5). No PDF library: the print
 * output IS the PDF, so the two can never disagree.
 */
export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const saleId = Number(id);
  if (!Number.isFinite(saleId)) notFound();

  const doc = await loadInvoice({ id: saleId });
  if (!doc) notFound();

  return (
    <div className="space-y-6">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .invoice, .invoice * { visibility: visible !important; }
          .invoice {
            position: absolute; left: 0; top: 0;
            width: 100%; margin: 0;
            border: none !important; box-shadow: none !important;
          }
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <InvoiceActions
        saleId={doc.sale.id}
        invoiceNo={doc.sale.invoiceNo}
        token={doc.sale.publicToken}
        message={shareText(doc)}
        phone={doc.sale.customer?.phone ?? null}
      />

      <div className="rounded-lg border bg-white shadow-sm">
        <A4Invoice doc={doc} />
      </div>
    </div>
  );
}
