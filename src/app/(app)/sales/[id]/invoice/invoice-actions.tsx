"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer, Share2, Link2, Copy, Unlink } from "lucide-react";
import { toast } from "sonner";
import { createShareLink, revokeShareLink } from "../share-actions";
import { Button } from "@/components/ui/button";

export function InvoiceActions({
  saleId,
  invoiceNo,
  token,
  message,
  phone,
}: {
  saleId: number;
  invoiceNo: string;
  token: string | null;
  message: string;
  phone: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [link, setLink] = useState<string | null>(
    token ? `${typeof window === "undefined" ? "" : window.location.origin}/i/${token}` : null,
  );

  /**
   * WhatsApp with the invoice as text (§20.5). Nothing is published: the customer
   * already has the paper slip, and this is its digital echo. The link below is the
   * separate, deliberate step.
   */
  function shareWhatsApp() {
    const to = (phone ?? "").replace(/[^\d]/g, "");
    const url = `https://wa.me/${to}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function makeLink() {
    startTransition(async () => {
      const res = await createShareLink(saleId);
      if (res.error || !res.token) {
        toast.error(res.error ?? "Could not create a link.");
        return;
      }
      const url = `${window.location.origin}/i/${res.token}`;
      setLink(url);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast.success("Public link created and copied");
      router.refresh();
    });
  }

  function revoke() {
    if (!confirm("Revoke this link? Anyone holding it will no longer see the invoice.")) {
      return;
    }
    startTransition(async () => {
      const res = await revokeShareLink(saleId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLink(null);
      toast.success("Link revoked");
      router.refresh();
    });
  }

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" asChild>
          <Link href={`/sales/${saleId}`}>
            <ArrowLeft className="size-4" /> Back to sale
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/sales/${saleId}/receipt`}>80mm receipt</Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="size-4" /> Print / Save as PDF
        </Button>
        <Button variant="outline" onClick={shareWhatsApp}>
          <Share2 className="size-4" /> WhatsApp
        </Button>
        {link ? (
          <>
            <Button
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Link copied");
              }}
            >
              <Copy className="size-4" /> Copy link
            </Button>
            <Button variant="ghost" onClick={revoke} disabled={pending}>
              <Unlink className="size-4" /> Revoke
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={makeLink} disabled={pending}>
            <Link2 className="size-4" /> Create public link
          </Button>
        )}
      </div>

      {link && (
        <p className="text-center text-xs text-muted-foreground">
          Anyone with this link can read {invoiceNo} — including the customer&apos;s name
          and what they bought. Revoke it when it has served its purpose.
        </p>
      )}
    </div>
  );
}
