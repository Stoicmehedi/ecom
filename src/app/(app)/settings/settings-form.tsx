"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { pointsEarned, pointsValue } from "@/lib/loyalty";
import type { ShopSettings } from "@/lib/settings";
import { saveSettings } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Bills to show the rule working on. Fixed, so the example never moves under you. */
const SAMPLE_BILLS = [640, 740, 99];

export function SettingsForm({ settings }: { settings: ShopSettings }) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
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
