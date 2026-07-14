"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Trash2,
  Plus,
  Minus,
  PauseCircle,
  RefreshCw,
  X,
  Gift,
} from "lucide-react";
import { toast } from "sonner";
import { priceLine } from "@/lib/pricing";
import { paidRatio } from "@/lib/costing";
import { pointsEarned, pointsValue, redeemLimit } from "@/lib/loyalty";
import type { ShopSettings } from "@/lib/settings";
import { checkout, holdSale, resumeHeldSale, discardHeldSale } from "./actions";
import Image from "next/image";
import { fileUrl } from "@/lib/files";
import { selectId } from "@/lib/select";
import { browsePos, searchPos, type PosHit, type PosProduct } from "./search";
import { VariantPicker, needsPicker } from "./variant-picker";
import { ExchangeDialog, type ExchangePick } from "./exchange-panel";
import { quickAddCustomer } from "../customers/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type CustomerOption = {
  id: number;
  name: string;
  isWalkIn: boolean;
  groupDiscount: number;
  points: number;
};
export type AccountOption = { id: number; name: string };
export type HeldSaleOption = {
  id: number;
  label: string;
  customerId: number | null;
  count: number;
};

/** The cart holds the variant's pricing rules; the price itself is derived. */
type Line = {
  variantId: number;
  label: string;
  sku: string;
  qty: number;
  price: number; // the catalogue selling price
  stockQty: number;
  discountType: "AMOUNT" | "PERCENT";
  discountValue: number;
  wholesalePrice: number | null;
  wholesaleQty: number | null;
  minSalePrice: number | null;
  /** Given away — a QC write-off / free issue (BLUEPRINT §16). Admin only. */
  free?: boolean;
};

type PayLine = { method: string; accountId: number | null; amount: number };

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MOBILE", label: "Mobile banking" },
  { value: "CARD", label: "Card" },
  { value: "BANK", label: "Bank transfer" },
  { value: "CHEQUE", label: "Cheque" },
];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Radix has no empty-string value, so "no filter" needs a sentinel. */
const ALL = "all";

export function PosTerminal({
  customers,
  accounts,
  canFreeIssue,
  settings,
  initialProducts,
  categories,
  brands,
  heldSales,
}: {
  customers: CustomerOption[];
  accounts: AccountOption[];
  canFreeIssue: boolean;
  settings: ShopSettings;
  initialProducts: PosProduct[];
  categories: { id: number; path: string }[];
  brands: { id: number; name: string }[];
  heldSales: HeldSaleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const walkIn = customers.find((c) => c.isWalkIn);
  const [customerId, setCustomerId] = useState<number | undefined>(walkIn?.id);
  const [lines, setLines] = useState<Line[]>([]);
  const [discountType, setDiscountType] = useState<"AMOUNT" | "PERCENT">("PERCENT");
  const [discountValue, setDiscountValue] = useState(0);
  const [remark, setRemark] = useState("");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PosProduct[]>(initialProducts);
  const [picking, setPicking] = useState<PosProduct | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Browsing filters. They narrow the grid; they never narrow a scan (§13.8).
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [brandId, setBrandId] = useState<number | undefined>();
  const filtered = categoryId !== undefined || brandId !== undefined;

  // A customer's group rate is NOT pre-filled as a bill discount any more — it is
  // one of the two candidates each line is priced against, and the better of the
  // two wins (BLUEPRINT §12.7a). Filling it in here as well would double it.
  function pickCustomer(id: number) {
    setCustomerId(id);
    setRedeem(0); // points belong to a customer, not to the cart
    const c = customers.find((x) => x.id === id);
    if (c && c.groupDiscount > 0) {
      toast.info(`${c.name} gets ${c.groupDiscount}% off`);
    }
  }

  function addLine(hit: PosHit) {
    if (hit.stockQty <= 0) {
      toast.error(`"${hit.label}" is out of stock`);
      return;
    }
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variantId === hit.variantId);
      if (i >= 0) {
        const next = [...prev];
        const line = next[i];
        if (line.qty + 1 > line.stockQty) {
          toast.error(`Only ${line.stockQty} of "${line.label}" in stock`);
          return prev;
        }
        next[i] = { ...line, qty: r2(line.qty + 1) };
        return next;
      }
      return [
        {
          variantId: hit.variantId,
          label: hit.label,
          sku: hit.sku,
          qty: 1,
          price: hit.price,
          stockQty: hit.stockQty,
          discountType: hit.discountType,
          discountValue: hit.discountValue,
          wholesalePrice: hit.wholesalePrice,
          wholesaleQty: hit.wholesaleQty,
          minSalePrice: hit.minSalePrice,
        },
        ...prev,
      ];
    });
  }

  /**
   * Tapping a tile. One variant means there is no choice to make, so it goes
   * straight in; more than one opens the picker. A scan never lands here — it
   * names the variant outright and skips this entirely.
   */
  function tapProduct(p: PosProduct) {
    if (!needsPicker(p)) {
      addLine(p.variants[0]);
      return;
    }
    setPicking(p);
  }

  // What the grid shows: the search term, narrowed by the filters. An exact
  // barcode/SKU hit drops straight into the cart — that's a scan, and it is the
  // one path the filters must never stand in the way of.
  useEffect(() => {
    const term = query.trim();
    const filter = { categoryId, brandId };

    // The unfiltered, unsearched grid is already on screen from the server.
    if (!term && !filtered) {
      setHits(initialProducts);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      if (!term) {
        const found = await browsePos(filter);
        if (!cancelled) setHits(found);
        return;
      }
      const { products: found, exact } = await searchPos(term, filter);
      if (cancelled) return;
      if (exact) {
        addLine(exact);
        setQuery("");
        return;
      }
      setHits(found);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, categoryId, brandId]);

  function setQty(i: number, qty: number) {
    setLines((prev) =>
      prev.map((l, idx) => {
        if (idx !== i) return l;
        const capped = Math.min(Math.max(qty, 0), l.stockQty);
        if (qty > l.stockQty) toast.error(`Only ${l.stockQty} of "${l.label}" in stock`);
        return { ...l, qty: capped };
      }),
    );
  }

  /**
   * Give this line away, or take the gift back. Deliberately a toggle and not a
   * price box: the minimum sale price is only a floor if there is no way to type
   * your way under it (BLUEPRINT §16.1).
   */
  function toggleFree(i: number) {
    setLines((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, free: !l.free } : l)),
    );
  }

  const selected = customers.find((c) => c.id === customerId);
  const groupPct = selected?.groupDiscount ?? 0;

  // A manual bill discount REPLACES the automatic per-line ones — never adds to
  // them. Priced through the very same function the server uses, so what the
  // cashier is looking at is what will actually be charged.
  const manual = discountValue > 0;
  const priced = lines.map((l) => ({
    line: l,
    p: priceLine({
      sellingPrice: l.price,
      wholesalePrice: l.wholesalePrice,
      wholesaleQty: l.wholesaleQty,
      discountType: manual ? "AMOUNT" : l.discountType,
      discountValue: manual ? 0 : l.discountValue,
      groupDiscountPct: manual ? 0 : groupPct,
      minSalePrice: l.minSalePrice,
      isFree: l.free === true,
      qty: l.qty,
    }),
  }));

  // A free issue must say why (BLUEPRINT §16.3) — a zero-value sale with no reason
  // is indistinguishable from a mistake. The server enforces this too.
  const hasFree = lines.some((l) => l.free);
  const needsRemark = hasFree && remark.trim() === "";

  const subtotal = r2(priced.reduce((s, x) => s + x.p.subtotal, 0));
  // A free line's whole value reads as "discount" in `priceLine`, which is true but
  // would misreport a give-away as a price cut. The two are counted separately.
  const autoDiscount = r2(
    priced.filter((x) => !x.p.isFree).reduce((s, x) => s + x.p.discount, 0),
  );
  /** What the goods given away were worth at the till (BLUEPRINT §16). */
  const givenAway = r2(
    priced.filter((x) => x.p.isFree).reduce((s, x) => s + x.p.discount, 0),
  );
  const discount =
    discountType === "PERCENT"
      ? r2(Math.min((subtotal * discountValue) / 100, subtotal))
      : r2(Math.min(discountValue, subtotal));
  const total = r2(subtotal - discount);

  // The bill discount lands on each line pro-rata, so it can breach a floor that
  // the line on its own clears. The server refuses either way; checking it here
  // too means the cashier learns it while typing, not at "Complete sale".
  const ratio = paidRatio(subtotal, discount);
  const blocked = priced.filter(
    (x) =>
      x.p.belowMin ||
      (x.p.minSalePrice != null && x.p.price * ratio < x.p.minSalePrice - 0.005),
  );
  const blockedIds = new Set(blocked.map((x) => x.line.variantId));

  // --- exchange (BLUEPRINT §14) ---
  const [exOpen, setExOpen] = useState(false);
  const [exchange, setExchange] = useState<ExchangePick | null>(null);

  // Goods handed back pay for the new ones first; only what they can't cover comes
  // back as money. The server recomputes all of this — this is what the cashier sees.
  const credit = exchange?.credit ?? 0;
  const creditApplied = r2(Math.min(credit, total));
  const excess = r2(credit - creditApplied);
  const afterCredit = r2(total - creditApplied);

  // --- loyalty points (BLUEPRINT §15). Priced through the very same functions the
  // server uses, so the cashier is never shown a number the till then refuses.
  const [redeem, setRedeem] = useState(0);
  const balance = selected && !selected.isWalkIn ? selected.points : 0;
  const limit = redeemLimit(balance, total, settings);
  // Never burn points on a bill an exchange credit has already covered.
  const spendable = Math.min(limit.maxPoints, Math.max(0, redeem));
  const redeemValue = r2(Math.min(pointsValue(spendable, settings), afterCredit));
  const owed = r2(afterCredit - redeemValue);

  // Earned on what they actually pay — so a free issue earns nothing, no special case.
  const willEarn =
    selected && !selected.isWalkIn ? pointsEarned(total, settings) : 0;

  // --- payment dialog ---
  const [payOpen, setPayOpen] = useState(false);
  const [payments, setPayments] = useState<PayLine[]>([]);
  const [tendered, setTendered] = useState(0);
  const [dueDate, setDueDate] = useState("");

  const paid = r2(payments.reduce((s, p) => s + (p.amount || 0), 0));
  const due = r2(owed - paid);
  const change = r2(Math.max(tendered - paid, 0));

  const isWalkIn = selected?.isWalkIn ?? false;

  function openPayment() {
    if (lines.length === 0) return toast.error("The cart is empty");
    if (needsRemark) {
      return toast.error('A free issue needs a remark saying why (e.g. "QC out")');
    }
    if (blocked.length > 0) {
      return toast.error(
        `"${blocked[0].line.label}" is below its minimum price — checkout will refuse it.`,
      );
    }
    setPayments([{ method: "CASH", accountId: accounts[0]?.id ?? null, amount: owed }]);
    setTendered(owed);
    setPayOpen(true);
  }

  function onCheckout() {
    if (due > 0 && isWalkIn) {
      return toast.error("A walk-in must pay in full — pick a customer for a credit sale");
    }
    startTransition(async () => {
      const res = await checkout({
        customerId: customerId ?? null,
        discountType,
        discountValue,
        dueDate: due > 0 && dueDate ? dueDate : undefined,
        note: remark.trim() || undefined,
        redeemPoints: spendable,
        // Sent so a reprint can still show what was handed over and what came back
        // as change — the till knows it, but only for as long as this screen lives.
        tendered: tendered > 0 ? tendered : undefined,
        // No price is sent — the server prices every line itself. `free` is a flag,
        // not a price, and the server re-checks the permission behind it.
        items: lines.map((l) => ({
          variantId: l.variantId,
          qty: l.qty,
          free: l.free === true,
        })),
        payments: payments
          .filter((p) => p.amount > 0)
          .map((p) => ({ method: p.method, accountId: p.accountId, amount: p.amount })),
        exchange: exchange
          ? {
              saleId: exchange.sale.saleId,
              lines: Object.entries(exchange.qtys).map(([id, qty]) => ({
                saleItemId: Number(id),
                qty,
              })),
              // Money only leaves when the goods handed back are worth more.
              refundMethod: excess > 0 ? "CASH" : undefined,
              refundAccountId:
                excess > 0 ? (accounts[0]?.id ?? null) : undefined,
            }
          : undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setPayOpen(false);
      setLines([]);
      setDiscountValue(0);
      setRemark("");
      setRedeem(0);
      setExchange(null);
      setCustomerId(walkIn?.id);
      toast.success(exchange ? "Exchange complete" : "Sale complete");
      // Whichever document the shop actually hands over (§27.3) — till roll or A4.
      const doc = settings.defaultPrint === "A4" ? "invoice" : "receipt";
      router.push(`/sales/${res.saleId}/${doc}`);
    });
  }

  // --- hold ---
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdLabel, setHoldLabel] = useState("");

  function onHold() {
    if (lines.length === 0) return toast.error("The cart is empty");
    startTransition(async () => {
      const res = await holdSale({
        label: holdLabel.trim() || `Cart ${new Date().toLocaleTimeString()}`,
        customerId: customerId ?? null,
        cart: lines,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setLines([]);
      setHoldLabel("");
      setHoldOpen(false);
      toast.success("Sale held");
      router.refresh();
    });
  }

  function onResume(id: number) {
    startTransition(async () => {
      const held = await resumeHeldSale(id);
      if (!held) {
        toast.error("That held sale is gone");
        return;
      }
      setLines(held.cart as unknown as Line[]);
      if (held.customerId) setCustomerId(held.customerId);
      toast.success(`Resumed "${held.label}"`);
      router.refresh();
    });
  }

  // --- quick-add customer ---
  const [addOpen, setAddOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");

  async function onQuickAdd() {
    const res = await quickAddCustomer(newPhone, newName);
    if (res.error || !res.id) return toast.error(res.error ?? "Failed");
    toast.success("Customer added");
    setAddOpen(false);
    setNewPhone("");
    setNewName("");
    router.refresh();
    setCustomerId(res.id);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_420px]">
      {/* Left: find products */}
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="h-12 pl-9 text-base"
            placeholder="Scan a barcode, or search by name / SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            autoComplete="off"
          />
        </div>

        {/* Browsing filters. A scan still finds anything, filter or no filter. */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={categoryId ? String(categoryId) : ALL}
            onValueChange={(v) => setCategoryId(selectId(v, [ALL]) ?? undefined)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.path}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={brandId ? String(brandId) : ALL}
            onValueChange={(v) => setBrandId(selectId(v, [ALL]) ?? undefined)}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All brands" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All brands</SelectItem>
              {brands.map((b) => (
                <SelectItem key={b.id} value={String(b.id)}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCategoryId(undefined);
                setBrandId(undefined);
                searchRef.current?.focus();
              }}
            >
              <X className="size-4" />
              Clear
            </Button>
          )}
        </div>

        {heldSales.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-3">
            <span className="text-sm text-muted-foreground">Held:</span>
            {heldSales.map((h) => (
              <span
                key={h.id}
                className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-sm"
              >
                <button
                  type="button"
                  className="hover:text-primary"
                  onClick={() => onResume(h.id)}
                >
                  {h.label}{" "}
                  <span className="text-xs text-muted-foreground">({h.count})</span>
                </button>
                <button
                  type="button"
                  aria-label="Discard"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    startTransition(async () => {
                      await discardHeldSale(h.id);
                      router.refresh();
                    })
                  }
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {hits.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-muted-foreground">
              No matching product.
            </p>
          )}
          {hits.map((h) => {
            const out = h.stockQty <= 0;
            const many = needsPicker(h);
            const price =
              h.minPrice === h.maxPrice
                ? h.minPrice.toFixed(2)
                : `${h.minPrice.toFixed(2)}–${h.maxPrice.toFixed(2)}`;
            return (
              <button
                key={h.productId}
                type="button"
                disabled={out}
                onClick={() => tapProduct(h)}
                className={`rounded-lg border p-3 text-left transition ${
                  out
                    ? "cursor-not-allowed opacity-50"
                    : "hover:border-primary hover:bg-accent"
                }`}
              >
                {h.imageKey && (
                  <div className="relative mb-2 aspect-square w-full overflow-hidden rounded bg-muted/40">
                    <Image
                      src={fileUrl(h.imageKey)!}
                      alt=""
                      fill
                      sizes="160px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <p className="line-clamp-2 text-sm font-medium">{h.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {many ? `${h.variants.length} options` : h.variants[0].sku}
                </p>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-semibold tabular-nums">{price}</span>
                  <span
                    className={`text-xs tabular-nums ${
                      out ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {out ? "out of stock" : `${h.stockQty} left`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <VariantPicker
        product={picking}
        onClose={() => setPicking(null)}
        onPick={(v) => {
          addLine(v);
          setPicking(null);
        }}
      />

      {/* Right: the cart */}
      <div className="flex h-fit flex-col gap-3 rounded-lg border p-4 lg:sticky lg:top-4">
        <div className="flex gap-2">
          <Select
            value={customerId ? String(customerId) : undefined}
            onValueChange={(v) => { const id = selectId(v, []); if (id) pickCustomer(id); }}
          >
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Customer" />
            </SelectTrigger>
            <SelectContent>
              {customers.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                  {c.groupDiscount > 0 && ` · ${c.groupDiscount}%`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Add customer"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="size-4" />
          </Button>
        </div>

        <div className="min-h-40 divide-y">
          {lines.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Scan or tap a product to start.
            </p>
          )}
          {priced.map(({ line: l, p }, i) => (
            <div key={l.variantId} className="flex items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {l.label}
                  {p.isFree && (
                    <span className="ml-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                      Free
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {p.isFree ? (
                    <>
                      <span className="line-through">{l.price.toFixed(2)}</span>{" "}
                      <span className="font-medium text-amber-700 dark:text-amber-400">
                        given away
                      </span>
                    </>
                  ) : p.discountPerUnit > 0 ? (
                    <>
                      <span className="line-through">{l.price.toFixed(2)}</span>{" "}
                      <span className="font-medium text-primary">
                        {p.price.toFixed(2)}
                      </span>{" "}
                      <span>
                        ({p.source === "variant" ? "product" : "group"} discount)
                      </span>
                      {p.isWholesale && (
                        <span className="ml-1 font-medium text-primary">· wholesale</span>
                      )}
                    </>
                  ) : (
                    <>
                      {p.price.toFixed(2)}
                      {p.isWholesale && (
                        <span className="ml-1 font-medium text-primary">· wholesale</span>
                      )}
                    </>
                  )}
                  {" · "}
                  {l.stockQty} in stock
                </p>
                {blockedIds.has(l.variantId) && (
                  <p className="text-xs font-medium text-destructive">
                    {p.belowMin
                      ? `Below its ${p.minSalePrice?.toFixed(2)} minimum — checkout will refuse this.`
                      : `The bill discount takes this under its ${p.minSalePrice?.toFixed(2)} minimum — checkout will refuse it.`}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  aria-label="Less"
                  onClick={() => setQty(i, l.qty - 1)}
                >
                  <Minus className="size-3" />
                </Button>
                <Input
                  type="number"
                  className="h-7 w-14 text-center"
                  value={l.qty}
                  min="0"
                  max={l.stockQty}
                  onChange={(e) => setQty(i, Number(e.target.value))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-7"
                  aria-label="More"
                  onClick={() => setQty(i, l.qty + 1)}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
              <span className="w-20 text-right text-sm font-medium tabular-nums">
                {p.subtotal.toFixed(2)}
              </span>
              {canFreeIssue && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={p.isFree ? "Charge for this" : "Give this free"}
                  title={p.isFree ? "Charge for this" : "Give this free (QC out)"}
                  onClick={() => toggleFree(i)}
                >
                  <Gift
                    className={`size-3.5 ${
                      p.isFree ? "text-amber-600" : "text-muted-foreground"
                    }`}
                  />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Remove"
                onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="size-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t pt-3">
          {autoDiscount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-primary">Automatic discount</span>
              <span className="tabular-nums text-primary">
                −{autoDiscount.toFixed(2)}
              </span>
            </div>
          )}
          <Row
            label={autoDiscount > 0 ? "Subtotal (after auto discount)" : "Subtotal"}
            value={subtotal.toFixed(2)}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">Manual discount</span>
            <div className="flex items-center gap-1">
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as "AMOUNT" | "PERCENT")}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AMOUNT">Amount</SelectItem>
                  <SelectItem value="PERCENT">%</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-8 w-20 text-right"
                value={discountValue}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
              />
              <span className="w-20 text-right text-sm tabular-nums">
                −{discount.toFixed(2)}
              </span>
            </div>
          </div>
          {manual && (
            <p className="text-xs text-muted-foreground">
              A manual discount <span className="font-medium">replaces</span> the
              automatic one — discounts never stack.
            </p>
          )}
          {givenAway > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-amber-700 dark:text-amber-400">
                Given away (free issue)
              </span>
              <span className="tabular-nums text-amber-700 dark:text-amber-400">
                {givenAway.toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-2">
            <span className="font-medium">Total</span>
            <span className="text-2xl font-semibold tabular-nums">{total.toFixed(2)}</span>
          </div>

          {(hasFree || remark !== "") && (
            <div className="space-y-1">
              <Label htmlFor="remark" className="text-xs">
                Remark {hasFree && <span className="text-destructive">*</span>}
              </Label>
              <Input
                id="remark"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={hasFree ? 'Why is this free? e.g. "QC out"' : "Optional"}
                className={needsRemark ? "border-destructive" : ""}
              />
              {needsRemark && (
                <p className="text-xs font-medium text-destructive">
                  Goods leaving free must say why — checkout will refuse this.
                </p>
              )}
            </div>
          )}

          {exchange && (
            <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm">
                  <p className="font-medium text-primary">
                    Exchange against {exchange.sale.invoiceNo}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {Object.values(exchange.qtys).reduce((a, b) => a + b, 0)} item(s)
                    coming back
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label="Cancel exchange"
                  onClick={() => setExchange(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
              <Row label="Credit for returned goods" value={`−${credit.toFixed(2)}`} />
              {excess > 0 ? (
                <p className="text-xs text-muted-foreground">
                  The goods handed back are worth{" "}
                  <span className="font-medium">{excess.toFixed(2)}</span> more than the
                  new ones — that goes back to the customer.
                </p>
              ) : (
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-medium">To pay</span>
                  <span className="text-xl font-semibold tabular-nums">
                    {owed.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Loyalty points. A redemption is a payment made in points, not a discount —
            the goods sold for what they sold for (BLUEPRINT §15.4). */}
        {settings.loyaltyEnabled && selected && !selected.isWalkIn && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Points</span>
              <span className="text-sm tabular-nums">
                {balance} available
                {balance > 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({pointsValue(balance, settings).toFixed(2)})
                  </span>
                )}
              </span>
            </div>

            {lines.length > 0 && limit.blocked ? (
              <p className="text-xs text-muted-foreground">{limit.blocked}</p>
            ) : lines.length > 0 ? (
              <>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max={limit.maxPoints}
                    step="1"
                    className="h-8 w-24 text-right"
                    value={redeem}
                    onChange={(e) => setRedeem(Number(e.target.value))}
                    aria-label="Points to spend"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    onClick={() => setRedeem(limit.maxPoints)}
                  >
                    Use max ({limit.maxPoints})
                  </Button>
                  {redeem > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8"
                      onClick={() => setRedeem(0)}
                    >
                      Clear
                    </Button>
                  )}
                </div>
                {redeemValue > 0 && (
                  <Row
                    label={`${spendable} points`}
                    value={`−${redeemValue.toFixed(2)}`}
                    className="text-primary"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Points can cover up to {settings.maxRedeemPct}% of a bill.
                </p>
              </>
            ) : null}

            {willEarn > 0 && (
              <p className="border-t pt-2 text-xs text-muted-foreground">
                This sale earns{" "}
                <span className="font-medium text-primary">{willEarn} points</span>{" "}
                ({pointsValue(willEarn, settings).toFixed(2)}).
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={lines.length === 0}
            onClick={() => setHoldOpen(true)}
          >
            <PauseCircle className="size-4" />
            Hold
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setExOpen(true)}
          >
            <RefreshCw className="size-4" />
            Exchange
          </Button>
          <Button
            variant="outline"
            disabled={lines.length === 0 && !exchange}
            onClick={() => {
              setLines([]);
              setExchange(null);
            }}
          >
            Clear
          </Button>
          <Button
            className="flex-[2]"
            disabled={lines.length === 0}
            onClick={openPayment}
          >
            Charge {owed.toFixed(2)}
          </Button>
        </div>
      </div>

      <ExchangeDialog open={exOpen} onOpenChange={setExOpen} onConfirm={setExchange} />

      {/* Payment */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment — {owed.toFixed(2)}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {payments.map((p, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Method</Label>
                  <Select
                    value={p.method}
                    onValueChange={(v) =>
                      setPayments((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, method: v } : x)),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Account</Label>
                  <Select
                    value={p.accountId ? String(p.accountId) : undefined}
                    onValueChange={(v) => {
                      const id = selectId(v, []);
                      if (!id) return;
                      setPayments((prev) =>
                        prev.map((x, idx) => (idx === i ? { ...x, accountId: id } : x)),
                      );
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Account" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-28 space-y-1">
                  <Label className="text-xs">Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right"
                    value={p.amount}
                    onChange={(e) =>
                      setPayments((prev) =>
                        prev.map((x, idx) =>
                          idx === i ? { ...x, amount: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove payment"
                  disabled={payments.length === 1}
                  onClick={() =>
                    setPayments((prev) => prev.filter((_, idx) => idx !== i))
                  }
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setPayments((prev) => [
                  ...prev,
                  { method: "CASH", accountId: accounts[0]?.id ?? null, amount: 0 },
                ])
              }
            >
              <Plus className="size-4" />
              Split payment
            </Button>

            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Cash tendered</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  className="text-right"
                  value={tendered}
                  onChange={(e) => setTendered(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Change to give back</Label>
                <div className="flex h-9 items-center justify-end rounded-md border bg-muted px-3 text-lg font-semibold tabular-nums">
                  {change.toFixed(2)}
                </div>
              </div>
            </div>

            {due > 0 && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm">
                  <span className="font-medium text-destructive">
                    Due {due.toFixed(2)}
                  </span>{" "}
                  — this is a credit sale.
                </p>
                {isWalkIn ? (
                  <p className="text-sm text-destructive">
                    A walk-in must pay in full. Pick a named customer to sell on credit.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <Label className="text-xs">Due date</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1 border-t pt-2">
              <Row label="Total" value={total.toFixed(2)} />
              <Row label="Paying" value={paid.toFixed(2)} />
              <Row
                label="Due"
                value={due.toFixed(2)}
                className={due > 0 ? "text-destructive" : "text-primary"}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={onCheckout}
              disabled={pending || (due > 0 && isWalkIn)}
              className="w-full"
            >
              {pending ? "Completing…" : "Complete sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hold */}
      <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hold this sale</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="holdLabel">Name it so you can find it again</Label>
            <Input
              id="holdLabel"
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="e.g. Blue shirt guy"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button onClick={onHold} disabled={pending}>
              Hold
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick-add customer */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qa-phone">Phone *</Label>
              <Input
                id="qa-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qa-name">Name</Label>
              <Input
                id="qa-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={onQuickAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  label,
  value,
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-sm tabular-nums ${className}`}>{value}</span>
    </div>
  );
}
