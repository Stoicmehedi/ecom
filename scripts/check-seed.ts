/**
 * Read the seeded database back and assert it is what the seed claims.
 *
 * Run: npx tsx scripts/check-seed.ts
 *
 * The point is not to re-read the seed script's own variables — it is to recompute
 * from the rows. The load-bearing check is that **stock value at cost equals what
 * the opening purchase actually paid**: stock and cost are written by two different
 * code paths, so if they agree, the goods on the shelf are worth exactly the money
 * that left the drawer for them.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { isValidEan13 } from "../src/lib/barcode";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const problems: string[] = [];
function check(ok: boolean, label: string) {
  console.log(`  ${ok ? "✅" : "❌"} ${label}`);
  if (!ok) problems.push(label);
}

async function main() {
  // --- Base ---
  console.log("\nBase data");
  const users = await prisma.user.findMany({ include: { role: true } });
  check(
    ["admin", "cashier"].every((u) => users.some((x) => x.username === u && x.isActive)),
    `users: ${users.map((u) => `${u.username} (${u.role?.name})`).join(", ")}`,
  );

  const accounts = await prisma.account.findMany({ orderBy: { id: "asc" } });
  const cash = accounts.find((a) => a.type === "CASH")!;
  check(
    accounts.length === 2,
    `accounts: ${accounts.map((a) => `${a.name} = ${a.balance}`).join(", ")}`,
  );

  const settings = await prisma.shopSetting.findUnique({ where: { id: 1 } });
  check(
    !!settings && settings.earnPoints === 10 && Number(settings.earnAmount) === 100,
    `settings: earn ${settings?.earnPoints} pts per ${settings?.earnAmount}, ` +
      `point = ${settings?.pointValue}, min redeem ${settings?.minRedeemPoints}, ` +
      `cap ${settings?.maxRedeemPct}%, alert qty ${settings?.defaultAlertQty}`,
  );

  const walkIn = await prisma.contact.count({ where: { isWalkIn: true } });
  check(walkIn === 1, `walk-in customer present (${walkIn})`);

  // --- Catalogue ---
  console.log("\nCatalogue");
  const variants = await prisma.productVariant.findMany({
    include: { product: true },
    orderBy: { id: "asc" },
  });
  const products = await prisma.product.count();
  check(products > 0 && variants.length > 0, `${products} products / ${variants.length} variants`);

  const badBarcodes = variants.filter((v) => !v.barcode || !isValidEan13(v.barcode));
  const distinct = new Set(variants.map((v) => v.barcode)).size;
  check(
    badBarcodes.length === 0 && distinct === variants.length,
    `every barcode is a valid, distinct EAN-13 (${distinct}/${variants.length})`,
  );

  console.log("\n  sku        product                   stock   cost    sell");
  for (const v of variants) {
    const name = `${v.product.name}${v.label ? ` ${v.label}` : ""}`;
    console.log(
      `  ${v.sku.padEnd(10)} ${name.padEnd(24)} ${String(v.stockQty).padStart(6)}  ` +
        `${String(v.purchasePrice).padStart(6)}  ${String(v.sellingPrice).padStart(6)}`,
    );
  }

  // --- The opening purchase ---
  console.log("\nOpening purchase");
  const purchase = await prisma.purchase.findFirst({
    include: { items: true, payments: true, supplier: true },
  });
  if (!purchase) {
    check(false, "PUR-00001 exists");
  } else {
    const total = Number(purchase.total);
    check(
      Number(purchase.due) === 0 && purchase.status === "PAID",
      `${purchase.purchaseNo}: total ${total.toFixed(2)}, paid ${purchase.paid}, due ${purchase.due} (${purchase.status})`,
    );
    check(
      Number(purchase.supplier?.dueBalance) === 0,
      `supplier ${purchase.supplier?.name} starts square (due ${purchase.supplier?.dueBalance})`,
    );
    check(
      purchase.items.length === variants.length,
      `one purchase line per variant (${purchase.items.length}/${variants.length})`,
    );

    // The real check: stock × cost, recomputed from the variant rows, must equal
    // the money the purchase document says left the drawer.
    const stockValue = variants.reduce(
      (s, v) => s + Number(v.stockQty) * Number(v.purchasePrice),
      0,
    );
    check(
      Math.abs(stockValue - total) < 0.005,
      `stock value at cost ${stockValue.toFixed(2)} = purchase total ${total.toFixed(2)}`,
    );

    const paidOut = purchase.payments.reduce((s, p) => s + Number(p.amount), 0);
    const openingFloat = Number(cash.openingBalance);
    check(
      Math.abs(Number(cash.balance) - (openingFloat - paidOut)) < 0.005,
      `cash ${cash.balance} = float ${openingFloat.toFixed(2)} − paid ${paidOut.toFixed(2)}`,
    );

    const movements = await prisma.stockMovement.findMany();
    const movedQty = movements.reduce((s, m) => s + Number(m.qty), 0);
    const stockQty = variants.reduce((s, v) => s + Number(v.stockQty), 0);
    check(
      movements.every((m) => m.type === "PURCHASE") && Math.abs(movedQty - stockQty) < 0.001,
      `every unit in stock has a movement behind it (${movedQty} moved = ${stockQty} on hand)`,
    );
  }

  // --- Nothing has happened yet ---
  console.log("\nLedgers start empty");
  const [sales, saleReturns, purchaseReturns, exchanges, points, held] = await Promise.all([
    prisma.sale.count(),
    prisma.saleReturn.count(),
    prisma.purchaseReturn.count(),
    prisma.exchange.count(),
    prisma.pointEntry.count(),
    prisma.heldSale.count(),
  ]);
  check(
    sales + saleReturns + purchaseReturns + exchanges + points + held === 0,
    `no sales / returns / exchanges / points / held carts ` +
      `(${sales}/${saleReturns}/${purchaseReturns}/${exchanges}/${points}/${held})`,
  );

  const customers = await prisma.contact.findMany({
    where: { type: "CUSTOMER" },
    include: { customerGroup: true },
  });
  check(
    customers.every((c) => Number(c.dueBalance) === 0 && c.loyaltyPoints === 0),
    `customers owe nothing and hold no points: ` +
      customers.map((c) => `${c.name}${c.customerGroup ? ` (${c.customerGroup.name})` : ""}`).join(", "),
  );

  console.log(
    problems.length === 0
      ? "\n✅ Seed verified — the DB is a clean, coherent starting point.\n"
      : `\n❌ ${problems.length} problem(s):\n${problems.map((p) => `   - ${p}`).join("\n")}\n`,
  );
  if (problems.length) process.exitCode = 1;
}

main().finally(() => prisma.$disconnect());
