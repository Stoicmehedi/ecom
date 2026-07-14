"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pointsEarned, pointsValue } from "@/lib/loyalty";
import type { ShopSettings } from "@/lib/settings";
import { invoicePrefixError, invoiceRule, nextDocNo, seqOf } from "@/lib/docno";
import { ImageUpload } from "@/components/image-upload";
import { saveSettings } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Bills to show the rule working on. Fixed, so the example never moves under you. */
const SAMPLE_BILLS = [640, 740, 99];

export function SettingsForm({
  settings,
  lastInvoiceNo,
}: {
  settings: ShopSettings;
  lastInvoiceNo: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [s, setS] = useState<ShopSettings>(settings);

  function set<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  function onSave() {
    startTransition(async () => {
      const res = await saveSettings(s);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Settings saved");
      router.refresh();
    });
  }

  // The same functions the POS and the server use, so what this preview promises is
  // exactly what the till will do.
  const examples = SAMPLE_BILLS.map((bill) => ({
    bill,
    points: pointsEarned(bill, s),
  }));
  const hundredBack = pointsValue(pointsEarned(100, s), s);
  const returnPct = Math.round(hundredBack * 100) / 100;

  // Same function the till mints the number with, so this promise is the one it keeps.
  const prefixError = invoicePrefixError(s.invoicePrefix);
  const nextInvoice = prefixError
    ? null
    : nextDocNo(lastInvoiceNo, invoiceRule(s));
  // The start number is only honoured while it is ahead of what is already issued.
  const overtaken = seqOf(lastInvoiceNo) >= s.invoiceStartNo;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        {/* Who the shop is — this is what a customer reads on the slip (§20.1). */}
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Your shop</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This is the heading on every receipt and invoice you hand over. Until you set
            it, customers walk out with a slip named after the till software.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <ImageUpload
                folder="logo"
                value={s.logoKey}
                onChange={(key) => set("logoKey", key)}
                label="Logo"
                hint="Prints at the top of the receipt, the invoice and the shared link."
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="shopName">Shop name *</Label>
              <Input
                id="shopName"
                value={s.shopName}
                onChange={(e) => set("shopName", e.target.value)}
                placeholder="Hansum"
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="shopAddress">Address</Label>
              <Input
                id="shopAddress"
                value={s.shopAddress ?? ""}
                onChange={(e) => set("shopAddress", e.target.value)}
                placeholder="Shaheb Ali Road, Natun Bazar"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopPhone">Phone</Label>
              <Input
                id="shopPhone"
                value={s.shopPhone ?? ""}
                onChange={(e) => set("shopPhone", e.target.value)}
                placeholder="01914678838"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="shopEmail">Email</Label>
              <Input
                id="shopEmail"
                value={s.shopEmail ?? ""}
                onChange={(e) => set("shopEmail", e.target.value)}
                placeholder="shop@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="currencyWord">Currency word</Label>
              <Input
                id="currencyWord"
                value={s.currencyWord}
                onChange={(e) => set("currencyWord", e.target.value)}
                placeholder="TK"
              />
              <p className="text-xs text-muted-foreground">
                Ends the amount-in-words line: &ldquo;… {s.currencyWord || "TK"} Only&rdquo;.
              </p>
            </div>
          </div>
        </section>

        {/* How invoices are numbered (§26). The only document a customer holds. */}
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Invoice numbering</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only new invoices are numbered this way. Ones you have already printed keep the
            number the customer is holding.
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              id="invoicePrefix"
              label="Prefix"
              hint="Goes in front of the number. May be left empty."
            >
              <Input
                id="invoicePrefix"
                value={s.invoicePrefix}
                onChange={(e) => set("invoicePrefix", e.target.value)}
                placeholder="INV-"
              />
            </Field>

            <Field
              id="invoiceStartNo"
              label="Start numbering at"
              hint="Match the books you are moving off."
            >
              <Input
                id="invoiceStartNo"
                type="number"
                min="1"
                step="1"
                value={s.invoiceStartNo}
                onChange={(e) => set("invoiceStartNo", Number(e.target.value))}
              />
            </Field>
          </div>

          <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
            {prefixError ? (
              <p className="text-destructive">{prefixError}</p>
            ) : (
              <>
                <p>
                  The next invoice will be{" "}
                  <span className="font-semibold tabular-nums text-primary">
                    {nextInvoice}
                  </span>
                  .
                </p>
                {overtaken && lastInvoiceNo && (
                  <p className="mt-1 text-muted-foreground">
                    You have already issued {lastInvoiceNo}, so numbering carries on from
                    there rather than going back to {s.invoiceStartNo} — an invoice number
                    is never handed out twice.
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* Loyalty */}
        <section className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-medium">Loyalty points</h2>
              <p className="text-sm text-muted-foreground">
                What customers earn, and what a point is worth when they spend it.
              </p>
            </div>
            <label className="flex shrink-0 items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={s.loyaltyEnabled}
                onChange={(e) => set("loyaltyEnabled", e.target.checked)}
              />
              Enabled
            </label>
          </div>

          <div
            className={`mt-4 space-y-4 ${
              s.loyaltyEnabled ? "" : "pointer-events-none opacity-50"
            }`}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                id="earnAmount"
                label="Earn points for every"
                hint="The bill has to reach this before anything is earned."
              >
                <Input
                  id="earnAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={s.earnAmount}
                  onChange={(e) => set("earnAmount", Number(e.target.value))}
                />
              </Field>
              <Field id="earnPoints" label="…this many points" hint="Whole points only.">
                <Input
                  id="earnPoints"
                  type="number"
                  min="0"
                  step="1"
                  value={s.earnPoints}
                  onChange={(e) => set("earnPoints", Number(e.target.value))}
                />
              </Field>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={s.earnRepeating}
                onChange={(e) => set("earnRepeating", e.target.checked)}
              />
              <span>
                <span className="font-medium">Repeat for every full multiple.</span>{" "}
                <span className="text-muted-foreground">
                  On, a bill of {fmt(s.earnAmount * 6.4)} earns {s.earnPoints * 6} points
                  (six full lots). Off, it earns {s.earnPoints} — once, no matter how
                  large the bill.
                </span>
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field
                id="pointValue"
                label="One point is worth"
                hint="When spent at the till."
              >
                <Input
                  id="pointValue"
                  type="number"
                  min="0"
                  step="0.01"
                  value={s.pointValue}
                  onChange={(e) => set("pointValue", Number(e.target.value))}
                />
              </Field>
              <Field
                id="minRedeemPoints"
                label="Minimum to spend"
                hint="Below this, points cannot be used."
              >
                <Input
                  id="minRedeemPoints"
                  type="number"
                  min="0"
                  step="1"
                  value={s.minRedeemPoints}
                  onChange={(e) => set("minRedeemPoints", Number(e.target.value))}
                />
              </Field>
              <Field
                id="maxRedeemPct"
                label="Max share of a bill (%)"
                hint="So every sale still takes money."
              >
                <Input
                  id="maxRedeemPct"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={s.maxRedeemPct}
                  onChange={(e) => set("maxRedeemPct", Number(e.target.value))}
                />
              </Field>
            </div>
          </div>
        </section>

        {/* What prints on the paper the customer walks out with (§27). */}
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">What prints on the receipt</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The 80mm receipt, the A4 invoice and the shared link all read the same
            settings, so they cannot disagree about what was sold.
          </p>

          <div className="mt-4 space-y-3">
            <Toggle
              checked={s.showTime}
              onChange={(v) => set("showTime", v)}
              label="Time of sale"
              hint="The date always prints; the time is optional."
            />
            <Toggle
              checked={s.showSizeColour}
              onChange={(v) => set("showSizeColour", v)}
              label="Size &amp; colour on each line"
              hint="&ldquo;Classic Tee — Red / M&rdquo; rather than just &ldquo;Classic Tee&rdquo;."
            />
            <Toggle
              checked={s.showSku}
              onChange={(v) => set("showSku", v)}
              label="SKU on each line"
              hint="A4 only. It is your stock code — it means nothing to the customer."
            />
            <Toggle
              checked={s.showPaymentDetails}
              onChange={(v) => set("showPaymentDetails", v)}
              label="Payment details"
              hint="How the bill was settled: cash, card, points, goods exchanged."
            />
            <Toggle
              checked={s.showInWords}
              onChange={(v) => set("showInWords", v)}
              label="Amount in words"
              hint="A digit can be altered with a pen; a sentence cannot."
            />
            <Toggle
              checked={s.showSignatures}
              onChange={(v) => set("showSignatures", v)}
              label="Signature lines"
              hint="A4 only — a till roll has no room for them."
            />
          </div>

          {s.showSignatures && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field id="signatureLeft" label="Left signature">
                <Input
                  id="signatureLeft"
                  value={s.signatureLeft}
                  onChange={(e) => set("signatureLeft", e.target.value)}
                  placeholder="Received by"
                />
              </Field>
              <Field id="signatureRight" label="Right signature">
                <Input
                  id="signatureRight"
                  value={s.signatureRight}
                  onChange={(e) => set("signatureRight", e.target.value)}
                  placeholder="Authorised by"
                />
              </Field>
            </div>
          )}

          <div className="mt-4 space-y-4">
            <Field
              id="footerNote"
              label="Footer note"
              hint="Prints at the bottom of every receipt and invoice. Your words, in your shop's name — a returns policy, an offer, or nothing at all."
            >
              <Input
                id="footerNote"
                value={s.footerNote ?? ""}
                onChange={(e) => set("footerNote", e.target.value)}
                placeholder="e.g. Exchange within 7 days with this receipt"
              />
            </Field>

            <Field
              id="defaultPrint"
              label="After a sale, open"
              hint="Whichever document you actually hand over."
            >
              <select
                id="defaultPrint"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
                value={s.defaultPrint}
                onChange={(e) =>
                  set("defaultPrint", e.target.value as ShopSettings["defaultPrint"])
                }
              >
                <option value="RECEIPT">80mm receipt</option>
                <option value="A4">A4 invoice</option>
              </select>
            </Field>
          </div>
        </section>

        {/* Stock */}
        <section className="rounded-lg border p-4">
          <h2 className="font-medium">Stock</h2>
          <p className="text-sm text-muted-foreground">
            Used when a product does not set its own alert quantity.
          </p>
          <div className="mt-4 max-w-xs">
            <Field
              id="defaultAlertQty"
              label="Default low-stock alert quantity"
              hint="A product's own alert quantity wins over this."
            >
              <Input
                id="defaultAlertQty"
                type="number"
                min="0"
                step="1"
                value={s.defaultAlertQty}
                onChange={(e) => set("defaultAlertQty", Number(e.target.value))}
              />
            </Field>
          </div>
        </section>

        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>

      {/* What the rule actually does — the numbers, not the words. */}
      <aside className="h-fit space-y-3 rounded-lg border bg-muted/30 p-4 lg:sticky lg:top-4">
        <h2 className="font-medium">What this means</h2>

        {s.loyaltyEnabled ? (
          <>
            <div className="space-y-1.5">
              {examples.map((e) => (
                <div key={e.bill} className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">A bill of {fmt(e.bill)}</span>
                  <span className="tabular-nums font-medium">
                    {e.points === 0 ? (
                      <span className="text-muted-foreground">no points</span>
                    ) : (
                      <>
                        {e.points} pts{" "}
                        <span className="text-muted-foreground">
                          ({fmt(pointsValue(e.points, s))})
                        </span>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t pt-3 text-sm">
              <p>
                Spend {fmt(100)} → get{" "}
                <span className="font-semibold text-primary">{fmt(returnPct)}</span> back
                in points.
              </p>
              <p className="mt-1 text-muted-foreground">
                An effective return of{" "}
                <span className="font-medium">{returnPct.toFixed(2)}%</span> on everything
                you sell. This is the cost of the scheme — check it is the number you
                meant.
              </p>
            </div>

            <p className="border-t pt-3 text-xs text-muted-foreground">
              Points are earned on the bill <em>after</em> discounts, by named customers
              only, and they come back off if the goods do.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Loyalty is switched off. No points are earned, and none can be spent.
          </p>
        )}
      </aside>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
