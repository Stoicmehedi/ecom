"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Store, Hash, Gift, Printer, Boxes } from "lucide-react";
import { pointsEarned, pointsValue } from "@/lib/loyalty";
import type { ShopSettings } from "@/lib/settings";
import { invoicePrefixError, invoiceRule, nextDocNo, seqOf } from "@/lib/docno";
import { ImageUpload } from "@/components/image-upload";
import { saveSettings } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Bills to show the rule working on. Fixed, so the example never moves under you. */
const SAMPLE_BILLS = [640, 740, 99];

type SectionKey = "shop" | "invoices" | "loyalty" | "receipt" | "stock";

const SECTIONS: { key: SectionKey; label: string; icon: typeof Store }[] = [
  { key: "shop", label: "Your shop", icon: Store },
  { key: "invoices", label: "Invoice numbering", icon: Hash },
  { key: "loyalty", label: "Loyalty points", icon: Gift },
  { key: "receipt", label: "Receipt & invoice", icon: Printer },
  { key: "stock", label: "Stock", icon: Boxes },
];

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
  const [active, setActive] = useState<SectionKey>("shop");

  function set<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) {
    setS((prev) => ({ ...prev, [key]: value }));
  }

  // Compared as a whole so the save bar reflects reality — nothing to save means
  // the button is off. After a save, `settings` refreshes to the stored values and
  // this settles back to clean without a special case.
  const dirty = useMemo(
    () => JSON.stringify(s) !== JSON.stringify(settings),
    [s, settings],
  );

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

  // The same functions the POS and the server use, so what the previews promise is
  // exactly what the till will do.
  const examples = SAMPLE_BILLS.map((bill) => ({ bill, points: pointsEarned(bill, s) }));
  const hundredBack = pointsValue(pointsEarned(100, s), s);
  const returnPct = Math.round(hundredBack * 100) / 100;

  const prefixError = invoicePrefixError(s.invoicePrefix);
  const nextInvoice = prefixError ? null : nextDocNo(lastInvoiceNo, invoiceRule(s));
  const overtaken = seqOf(lastInvoiceNo) >= s.invoiceStartNo;

  const activeMeta = SECTIONS.find((x) => x.key === active)!;

  return (
    <div className="space-y-5">
      <div className="grid items-start gap-5 lg:grid-cols-[13.5rem_1fr]">
        {/* Section rail: a vertical list on desktop, a horizontal scroll on a phone. */}
        <nav
          aria-label="Settings sections"
          className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:sticky lg:top-4 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0"
        >
          {SECTIONS.map((sec) => {
            const Icon = sec.icon;
            const on = sec.key === active;
            return (
              <button
                key={sec.key}
                type="button"
                onClick={() => setActive(sec.key)}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors lg:w-full",
                  on
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {sec.label}
              </button>
            );
          })}
        </nav>

        {/* The active section only — one group in view at a time. */}
        <div className="min-w-0 rounded-lg border bg-card shadow-sm">
          <div className="border-b px-5 py-4 sm:px-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="flex items-center gap-2 font-semibold">
                <activeMeta.icon className="size-4 text-muted-foreground" />
                {activeMeta.label}
              </h2>
              {active === "loyalty" && (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {s.loyaltyEnabled ? "On" : "Off"}
                  </span>
                  <Switch
                    checked={s.loyaltyEnabled}
                    onCheckedChange={(v) => set("loyaltyEnabled", v)}
                    aria-label="Loyalty enabled"
                  />
                </label>
              )}
            </div>
          </div>

          <div className="px-5 py-5 sm:px-6">
            {active === "shop" && <ShopSection s={s} set={set} />}
            {active === "invoices" && (
              <InvoicesSection
                s={s}
                set={set}
                prefixError={prefixError}
                nextInvoice={nextInvoice}
                overtaken={overtaken}
                lastInvoiceNo={lastInvoiceNo}
              />
            )}
            {active === "loyalty" && (
              <LoyaltySection
                s={s}
                set={set}
                examples={examples}
                returnPct={returnPct}
              />
            )}
            {active === "receipt" && <ReceiptSection s={s} set={set} />}
            {active === "stock" && <StockSection s={s} set={set} />}
          </div>
        </div>
      </div>

      {/* One action bar for the whole page — always in reach, and it says whether
          there is anything to save. Full-bleed to the main padding so it reads as a
          footer rather than a stray button. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:-mx-5 lg:px-5">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {dirty ? (
            <>
              <span className="size-2 rounded-full bg-primary" />
              Unsaved changes
            </>
          ) : (
            "All changes saved"
          )}
        </p>
        <div className="flex gap-2">
          {dirty && !pending && (
            <Button variant="ghost" onClick={() => setS(settings)}>
              Discard
            </Button>
          )}
          <Button onClick={onSave} disabled={pending || !dirty}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </div>
    </div>
  );
}

type SetFn = <K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) => void;

function ShopSection({ s, set }: { s: ShopSettings; set: SetFn }) {
  return (
    <div className="space-y-5">
      <SectionIntro>
        The heading on every receipt and invoice you hand over. Until you set it,
        customers walk out with a slip named after the till software.
      </SectionIntro>

      <ImageUpload
        folder="logo"
        value={s.logoKey}
        onChange={(key) => set("logoKey", key)}
        label="Logo"
        hint="Prints on the receipt, the invoice, and the app's own sidebar."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="shopName" label="Shop name" required className="sm:col-span-2">
          <Input
            id="shopName"
            value={s.shopName}
            onChange={(e) => set("shopName", e.target.value)}
            placeholder="Hansum"
          />
        </Field>
        <Field id="shopAddress" label="Address" className="sm:col-span-2">
          <Input
            id="shopAddress"
            value={s.shopAddress ?? ""}
            onChange={(e) => set("shopAddress", e.target.value)}
            placeholder="Shaheb Ali Road, Natun Bazar"
          />
        </Field>
        <Field id="shopPhone" label="Phone">
          <Input
            id="shopPhone"
            value={s.shopPhone ?? ""}
            onChange={(e) => set("shopPhone", e.target.value)}
            placeholder="01914678838"
          />
        </Field>
        <Field id="shopEmail" label="Email">
          <Input
            id="shopEmail"
            value={s.shopEmail ?? ""}
            onChange={(e) => set("shopEmail", e.target.value)}
            placeholder="shop@example.com"
          />
        </Field>
        <Field
          id="currencyWord"
          label="Currency word"
          hint={`Ends the amount-in-words line: “… ${s.currencyWord || "TK"} Only”.`}
        >
          <Input
            id="currencyWord"
            value={s.currencyWord}
            onChange={(e) => set("currencyWord", e.target.value)}
            placeholder="TK"
          />
        </Field>
      </div>
    </div>
  );
}

function InvoicesSection({
  s,
  set,
  prefixError,
  nextInvoice,
  overtaken,
  lastInvoiceNo,
}: {
  s: ShopSettings;
  set: SetFn;
  prefixError: string | null;
  nextInvoice: string | null;
  overtaken: boolean;
  lastInvoiceNo: string | null;
}) {
  return (
    <div className="space-y-5">
      <SectionIntro>
        Only new invoices are numbered this way. Ones you have already printed keep the
        number the customer is holding.
      </SectionIntro>

      <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="rounded-md border bg-muted/40 p-3.5 text-sm">
        {prefixError ? (
          <p className="text-destructive">{prefixError}</p>
        ) : (
          <>
            <p>
              The next invoice will be{" "}
              <span className="font-semibold tabular-nums text-primary">{nextInvoice}</span>.
            </p>
            {overtaken && lastInvoiceNo && (
              <p className="mt-1 text-muted-foreground">
                You have already issued {lastInvoiceNo}, so numbering carries on from there
                rather than going back to {s.invoiceStartNo} — an invoice number is never
                handed out twice.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LoyaltySection({
  s,
  set,
  examples,
  returnPct,
}: {
  s: ShopSettings;
  set: SetFn;
  examples: { bill: number; points: number }[];
  returnPct: number;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
      <div
        className={cn(
          "space-y-5",
          !s.loyaltyEnabled && "pointer-events-none opacity-50",
        )}
      >
        <SectionIntro>
          What customers earn, and what a point is worth when they spend it.
        </SectionIntro>

        <div className="grid gap-4 sm:grid-cols-2">
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

        <SwitchRow
          checked={s.earnRepeating}
          onChange={(v) => set("earnRepeating", v)}
          label="Repeat for every full multiple"
          hint={`On, a bill of ${fmt(s.earnAmount * 6.4)} earns ${
            s.earnPoints * 6
          } points (six full lots). Off, it earns ${s.earnPoints} — once, no matter how large the bill.`}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="pointValue" label="One point is worth" hint="When spent at the till.">
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

      {/* The rule in numbers, not words — sits right beside the controls it explains. */}
      <aside className="h-fit space-y-3 rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">What this means</p>
        {s.loyaltyEnabled ? (
          <>
            <div className="space-y-1.5">
              {examples.map((e) => (
                <div key={e.bill} className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">A bill of {fmt(e.bill)}</span>
                  <span className="font-medium tabular-nums">
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
                <span className="font-semibold text-primary">{fmt(returnPct)}</span> back in
                points.
              </p>
              <p className="mt-1 text-muted-foreground">
                An effective return of{" "}
                <span className="font-medium">{returnPct.toFixed(2)}%</span> on everything
                you sell — the cost of the scheme.
              </p>
            </div>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Earned on the bill <em>after</em> discounts, by named customers only, and
              clawed back if the goods come back.
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

function ReceiptSection({ s, set }: { s: ShopSettings; set: SetFn }) {
  return (
    <div className="space-y-5">
      <SectionIntro>
        The 80mm receipt, the A4 invoice and the shared link all read the same settings, so
        they cannot disagree about what was sold.
      </SectionIntro>

      <div className="divide-y rounded-md border">
        <SwitchRow
          checked={s.showTime}
          onChange={(v) => set("showTime", v)}
          label="Time of sale"
          hint="The date always prints; the time is optional."
          boxed
        />
        <SwitchRow
          checked={s.showSizeColour}
          onChange={(v) => set("showSizeColour", v)}
          label="Size & colour on each line"
          hint="“Classic Tee — Red / M” rather than just “Classic Tee”."
          boxed
        />
        <SwitchRow
          checked={s.showSku}
          onChange={(v) => set("showSku", v)}
          label="SKU on each line"
          hint="A4 only. It is your stock code — it means nothing to the customer."
          boxed
        />
        <SwitchRow
          checked={s.showPaymentDetails}
          onChange={(v) => set("showPaymentDetails", v)}
          label="Payment details"
          hint="How the bill was settled: cash, card, points, goods exchanged."
          boxed
        />
        <SwitchRow
          checked={s.showInWords}
          onChange={(v) => set("showInWords", v)}
          label="Amount in words"
          hint="A digit can be altered with a pen; a sentence cannot."
          boxed
        />
        <SwitchRow
          checked={s.showSignatures}
          onChange={(v) => set("showSignatures", v)}
          label="Signature lines"
          hint="A4 only — a till roll has no room for them."
          boxed
        />
      </div>

      {s.showSignatures && (
        <div className="grid gap-4 sm:grid-cols-2">
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="footerNote"
          label="Footer note"
          hint="Prints at the bottom of every receipt and invoice — a returns policy, an offer, or nothing."
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
          <Select
            value={s.defaultPrint}
            onValueChange={(v) =>
              set("defaultPrint", v as ShopSettings["defaultPrint"])
            }
          >
            <SelectTrigger id="defaultPrint" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RECEIPT">80mm receipt</SelectItem>
              <SelectItem value="A4">A4 invoice</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function StockSection({ s, set }: { s: ShopSettings; set: SetFn }) {
  return (
    <div className="space-y-5">
      <SectionIntro>Used when a product does not set its own alert quantity.</SectionIntro>
      <div className="max-w-xs">
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
    </div>
  );
}

function SectionIntro({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm text-muted-foreground">{children}</p>;
}

function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  boxed,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  /** When rows are grouped in a bordered list, give each one its own padding. */
  boxed?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4",
        boxed ? "px-3.5 py-3" : "",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-sm">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
