import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadInvoice } from "@/lib/invoice";
import { A4Invoice } from "@/components/invoice/invoice-doc";

/**
 * The public invoice (BLUEPRINT §20.5).
 *
 * Readable by anyone holding the link and nobody else — the token is 32 bytes of
 * CSPRNG hex, minted only when someone chooses to share, and revocable.
 *
 * It lives OUTSIDE the (app) group, so it is not behind the auth guard — that is the
 * point. Two consequences are handled deliberately:
 *
 *  1. **It must never be indexed.** A shared invoice in a search engine would be a
 *     customer's name, phone and purchase, published. Hence `noindex, nofollow`.
 *  2. **It shows only what the customer already knows.** The document carries no
 *     cost and no profit — `loadInvoice` does not even select them.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function PublicInvoicePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // A malformed token is a 404, not an error page: it must be indistinguishable
  // from a token that simply does not exist.
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();

  const doc = await loadInvoice({ publicToken: token });
  if (!doc) notFound();

  return (
    <main className="min-h-svh bg-neutral-100 p-4 sm:p-8">
      <style>{`
        @media print {
          body { background: #fff !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>
      <div className="mx-auto max-w-3xl rounded-lg bg-white shadow-sm">
        <A4Invoice doc={doc} />
      </div>
    </main>
  );
}
