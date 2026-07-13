// prisma/seed.ts — idempotent seed: base data + a small demo catalogue.
// Run: npx tsx prisma/seed.ts   (or: npx prisma db seed, or npx prisma migrate reset)
//
// Two parts:
//   1. BASE — what the app cannot run without: branch, roles, users, accounts,
//      return reasons, the walk-in customer, the settings row.
//   2. DEMO — a small clothing catalogue so the POS has something to sell.
//      Stock arrives through a real PURCHASE document, using the same costing
//      helpers the purchase action uses (src/lib/costing.ts). Nothing here fakes
//      a stock level: every unit on the shelf has a purchase behind it, at a cost
//      the weighted-average rule computed. There are NO sales, returns or points —
//      the ledgers start at zero so that any figure you see later is one you caused.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
// tsx does NOT resolve the "@/..." alias — use the relative paths.
import { PrismaClient } from "../src/generated/prisma/client";
import { avgAfterPurchase, docStatus, round2, round3 } from "../src/lib/costing";
import { makeEan13 } from "../src/lib/barcode";
import { LOYALTY_EXPENSE_TYPE, STOCK_LOSS_EXPENSE_TYPE } from "../src/lib/expenses";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Small, sensible permission set for a cashier (module.action keys).
// Note "reports.view" without "reports.profit": a cashier sees sales, dues and
// stock, but never cost or margin (BLUEPRINT §11.2).
// Note also NO "sales.free_issue": only an Admin may hand goods over at 0.00
// (BLUEPRINT §16.2). Nor "settings.manage" — an earn rate is a lever on every future
// sale (§17.3). Admin holds ["*"], so neither needs an entry there.
const CASHIER_PERMISSIONS = [
  "pos.access",
  "sales.create",
  "sales.view",
  "products.view",
  "contacts.view",
  "reports.view",
];

/** The till float. Without it the first purchase paid in cash drives the drawer negative. */
const CASH_FLOAT = 50_000;

async function seedBase() {
  // --- Branch (no unique field besides id → findFirst then create) ---
  let branch = await prisma.branch.findFirst({ where: { name: "Main Store" } });
  if (!branch) {
    branch = await prisma.branch.create({ data: { name: "Main Store" } });
  }

  // --- Roles (Role.name is unique → upsert) ---
  const adminRole = await prisma.role.upsert({
    where: { name: "Admin" },
    update: { permissions: ["*"] },
    create: { name: "Admin", permissions: ["*"] },
  });

  const cashierRole = await prisma.role.upsert({
    where: { name: "Cashier" },
    update: { permissions: CASHIER_PERMISSIONS },
    create: { name: "Cashier", permissions: CASHIER_PERMISSIONS },
  });

  // --- Users (User.username is unique → upsert) ---
  // The cashier is seeded too: the permission gates are only ever proven by
  // logging in as one, so it must survive a wipe like everything else.
  const users: Array<[string, string, string, number]> = [
    ["Administrator", "admin", "admin123", adminRole.id],
    ["Cashier", "cashier", "cashier123", cashierRole.id],
  ];
  for (const [name, username, password, roleId] of users) {
    const passwordHash = bcrypt.hashSync(password, 10);
    await prisma.user.upsert({
      where: { username },
      update: { name, passwordHash, isActive: true, roleId, branchId: branch.id },
      create: {
        name,
        username,
        passwordHash,
        isActive: true,
        roleId,
        branchId: branch.id,
      },
    });
  }

  // --- Accounts (no unique field → findFirst then create) ---
  let cash = await prisma.account.findFirst({ where: { name: "Cash", type: "CASH" } });
  if (!cash) {
    cash = await prisma.account.create({
      data: {
        name: "Cash",
        type: "CASH",
        openingBalance: CASH_FLOAT,
        balance: CASH_FLOAT,
      },
    });
  }

  const bank = await prisma.account.findFirst({ where: { name: "Bank", type: "BANK" } });
  if (!bank) {
    await prisma.account.create({ data: { name: "Bank", type: "BANK" } });
  }

  // --- Purchase-return reasons (ReturnType.name is unique → upsert) ---
  for (const name of ["Damaged", "Wrong item", "Excess", "Expired"]) {
    await prisma.returnType.upsert({ where: { name }, update: {}, create: { name } });
  }

  // --- Walk-in customer (POS default; no unique field → findFirst then create) ---
  const walkIn = await prisma.contact.findFirst({ where: { isWalkIn: true } });
  if (!walkIn) {
    await prisma.contact.create({
      data: { type: "CUSTOMER", name: "Walk-in customer", isWalkIn: true },
    });
  }

  // --- Settings: one typed row, schema defaults = the shop's real loyalty rule (§15). ---
  await prisma.shopSetting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  // --- The one expense type nobody types by hand (§18.8): loyalty redemptions post
  // against it automatically. Created here so it exists before the first sale does.
  for (const name of [LOYALTY_EXPENSE_TYPE, STOCK_LOSS_EXPENSE_TYPE]) {
    await prisma.expenseType.upsert({
      where: { name },
      update: { isSystem: true },
      create: { name, isSystem: true },
    });
  }

  return { branch, cash };
}

// --------------------------------------------------------------------------
// DEMO CATALOGUE
// --------------------------------------------------------------------------

/** Find-or-create a category at `level` under `parentId`. */
async function category(name: string, level: number, parentId: number | null) {
  const found = await prisma.category.findFirst({ where: { name, level, parentId } });
  return found ?? prisma.category.create({ data: { name, level, parentId } });
}

type VariantSpec = {
  sku: string;
  label: string | null;
  attributeId: number | null;
  colorId: number | null;
  cost: number; // what the seeding purchase pays for it
  sellingPrice: number;
  wholesalePrice?: number;
  wholesaleQty?: number;
  openingQty: number; // bought in on PUR-00001 — never written to stock directly
};

async function seedDemo(branchId: number, cashAccountId: number) {
  // Idempotent: the catalogue is only laid down into an empty one.
  if ((await prisma.product.count()) > 0) {
    console.log("Demo catalogue: products already exist — skipped.");
    return;
  }

  // --- Masters ---
  const apparel = await category("Apparel", 1, null);
  const tops = await category("Tops", 2, apparel.id);
  const accessories = await category("Accessories", 2, apparel.id);
  const tees = await category("T-Shirts", 3, tops.id);
  const hoodies = await category("Hoodies", 3, tops.id);
  const caps = await category("Caps", 3, accessories.id);
  const socks = await category("Socks", 3, accessories.id);

  const zephyr = await prisma.brand.upsert({
    where: { name: "Zephyr" },
    update: {},
    create: { name: "Zephyr" },
  });
  const northbound = await prisma.brand.upsert({
    where: { name: "Northbound" },
    update: {},
    create: { name: "Northbound" },
  });

  let piece = await prisma.unit.findFirst({ where: { name: "Piece" } });
  if (!piece) piece = await prisma.unit.create({ data: { name: "Piece", shortName: "pc" } });

  let pair = await prisma.unit.findFirst({ where: { name: "Pair" } });
  if (!pair) pair = await prisma.unit.create({ data: { name: "Pair", shortName: "pr" } });

  // The Size axis and its values, in wearing order — sortIndex is why the grid
  // reads S, M, L, XL and not alphabetically L, M, S, XL.
  const sizeAxis = await prisma.attributeCategory.upsert({
    where: { name: "Size" },
    update: {},
    create: { name: "Size" },
  });
  const sizes: Record<string, number> = {};
  for (const [i, name] of ["S", "M", "L", "XL"].entries()) {
    const a = await prisma.attribute.upsert({
      where: { attributeCategoryId_name: { attributeCategoryId: sizeAxis.id, name } },
      update: { sortIndex: i },
      create: { attributeCategoryId: sizeAxis.id, name, sortIndex: i },
    });
    sizes[name] = a.id;
  }

  const colors: Record<string, number> = {};
  const colorSpecs: Array<[string, string]> = [
    ["Red", "#dc2626"],
    ["Navy", "#1e3a5f"],
    ["Olive", "#4d7c0f"],
    ["White", "#f8fafc"],
  ];
  for (const [i, [name, hex]] of colorSpecs.entries()) {
    const c = await prisma.color.upsert({
      where: { name },
      update: { hex, sortIndex: i },
      create: { name, hex, sortIndex: i },
    });
    colors[name] = c.id;
  }

  // --- Contacts ---
  const supplier = await prisma.contact.create({
    data: {
      type: "SUPPLIER",
      name: "Rahim Traders",
      businessName: "Rahim Traders Ltd.",
      phone: "01711000001",
      address: "Islampur Road, Dhaka",
    },
  });

  const gold = await prisma.customerGroup.upsert({
    where: { name: "Gold" },
    update: { discount: 10 },
    create: { name: "Gold", discount: 10 },
  });

  await prisma.contact.createMany({
    data: [
      {
        type: "CUSTOMER",
        name: "Karim Mia",
        phone: "01811000001",
        customerGroupId: gold.id,
      },
      { type: "CUSTOMER", name: "Nadia Rahman", phone: "01811000002" },
    ],
  });

  // --- Expense types (§18) — what the shop's money goes on besides stock.
  // No expenses are seeded: the ledgers start at zero. These are just the names.
  for (const name of ["Space Rent", "Electricity", "Internet Bill", "Salary"]) {
    await prisma.expenseType.upsert({ where: { name }, update: {}, create: { name } });
  }

  // --- Adjustment reasons (§19) — why stock moves without a sale or a purchase.
  for (const name of ["Damage", "Theft", "Miscount", "Sample"]) {
    await prisma.adjustmentType.upsert({ where: { name }, update: {}, create: { name } });
  }

  // --- Products ---
  // The cross-product a VARIABLE product's variants are generated from, exactly
  // as the product form's "Generate variants" button does it.
  function grid(
    skuBase: string,
    sizeNames: string[],
    colorNames: string[],
    base: Omit<VariantSpec, "sku" | "label" | "attributeId" | "colorId">,
  ): VariantSpec[] {
    const out: VariantSpec[] = [];
    for (const s of sizeNames) {
      for (const c of colorNames) {
        out.push({
          ...base,
          sku: `${skuBase}-${s}-${c.slice(0, 3).toUpperCase()}`,
          label: `${c} / ${s}`,
          attributeId: sizes[s],
          colorId: colors[c],
        });
      }
    }
    return out;
  }

  const products: Array<{
    name: string;
    code: string;
    description?: string;
    type: "SIMPLE" | "VARIABLE";
    categoryId: number;
    brandId: number;
    unitId: number;
    alertQty?: number;
    minSalePrice?: number;
    sizeNames?: string[];
    colorNames?: string[];
    variants: VariantSpec[];
  }> = [
    {
      name: "Classic Tee",
      code: "CT",
      description: "Everyday cotton crew-neck.",
      type: "VARIABLE",
      categoryId: tees.id,
      brandId: zephyr.id,
      unitId: piece.id,
      alertQty: 4,
      sizeNames: ["S", "M", "L"],
      colorNames: ["Red", "Navy"],
      variants: grid("CT", ["S", "M", "L"], ["Red", "Navy"], {
        cost: 5,
        sellingPrice: 12,
        openingQty: 10,
      }),
    },
    {
      // Carries a price floor and a wholesale break — the two pricing rules
      // (§12.7a) need a product that actually exercises them.
      name: "Field Tee",
      code: "FT",
      description: "Heavier tee, garment-dyed.",
      type: "VARIABLE",
      categoryId: tees.id,
      brandId: zephyr.id,
      unitId: piece.id,
      alertQty: 4,
      minSalePrice: 9,
      sizeNames: ["S", "M", "L"],
      colorNames: ["Navy", "Olive"],
      variants: grid("FT", ["S", "M", "L"], ["Navy", "Olive"], {
        cost: 6,
        sellingPrice: 12,
        wholesalePrice: 10,
        wholesaleQty: 5,
        openingQty: 10,
      }),
    },
    {
      name: "Trail Hoodie",
      code: "TH",
      description: "Brushed-back fleece hoodie.",
      type: "VARIABLE",
      categoryId: hoodies.id,
      brandId: northbound.id,
      unitId: piece.id,
      alertQty: 3,
      sizeNames: ["M", "L", "XL"],
      colorNames: ["Navy", "Olive"],
      variants: grid("TH", ["M", "L", "XL"], ["Navy", "Olive"], {
        cost: 18,
        sellingPrice: 39,
        openingQty: 6,
      }),
    },
    {
      name: "Canvas Cap",
      code: "CC",
      type: "SIMPLE",
      categoryId: caps.id,
      brandId: northbound.id,
      unitId: piece.id,
      variants: [
        {
          sku: "CC-001",
          label: null,
          attributeId: null,
          colorId: null,
          cost: 4,
          sellingPrice: 9,
          openingQty: 20,
        },
      ],
    },
    {
      name: "Cotton Socks",
      code: "CS",
      type: "SIMPLE",
      categoryId: socks.id,
      brandId: zephyr.id,
      unitId: pair.id,
      alertQty: 12,
      variants: [
        {
          sku: "CS-001",
          label: null,
          attributeId: null,
          colorId: null,
          cost: 1.2,
          sellingPrice: 3.5,
          wholesalePrice: 2.8,
          wholesaleQty: 10,
          openingQty: 50,
        },
      ],
    },
  ];

  // Every variant we create, paired with the cost and qty the purchase will bring
  // it in at. Stock is NOT set here — the purchase below moves it.
  const received: Array<{ variantId: number; qty: number; price: number }> = [];

  for (const [pi, p] of products.entries()) {
    const product = await prisma.product.create({
      data: {
        name: p.name,
        code: p.code,
        description: p.description ?? null,
        type: p.type,
        categoryId: p.categoryId,
        brandId: p.brandId,
        unitId: p.unitId,
        branchId,
        sortIndex: pi,
        alertQty: p.alertQty ?? null,
        minSalePrice: p.minSalePrice ?? null,
        attributeCategoryId: p.type === "VARIABLE" ? sizeAxis.id : null,
        // What the product *offers*, kept so the grid can be regenerated on edit.
        attributes: p.sizeNames
          ? { connect: p.sizeNames.map((s) => ({ id: sizes[s] })) }
          : undefined,
        colors: p.colorNames
          ? { connect: p.colorNames.map((c) => ({ id: colors[c] })) }
          : undefined,
      },
    });

    for (const [vi, v] of p.variants.entries()) {
      const variant = await prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: v.sku,
          label: v.label,
          sortIndex: vi,
          attributeId: v.attributeId,
          colorId: v.colorId,
          sellingPrice: v.sellingPrice,
          wholesalePrice: v.wholesalePrice ?? null,
          wholesaleQty: v.wholesaleQty ?? null,
          // Cost and stock stay at zero: the purchase sets them.
        },
      });
      // The barcode is minted from the variant's own id, so it is unique by
      // construction — the same rule the app uses when it fills a blank one.
      await prisma.productVariant.update({
        where: { id: variant.id },
        data: { barcode: makeEan13(variant.id) },
      });
      received.push({ variantId: variant.id, qty: v.openingQty, price: v.cost });
    }
  }

  // --- The opening purchase: PUR-00001, paid in full from Cash ---
  // This is what puts stock on the shelf. It runs the same arithmetic the purchase
  // action runs, from the same module — so avg cost, the payable and the drawer all
  // land where the app itself would have put them.
  const subtotal = round2(received.reduce((s, r) => s + r.qty * r.price, 0));
  const total = subtotal; // no order discount on the opening buy
  const paid = total; // paid in full, so the supplier starts square

  await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        purchaseNo: "PUR-00001",
        supplierInvoiceNo: "RT-1001",
        supplierId: supplier.id,
        branchId,
        note: "Opening stock",
        subtotal,
        total,
        paid,
        due: round2(total - paid),
        status: docStatus(total, paid),
      },
    });

    for (const r of received) {
      await tx.purchaseItem.create({
        data: {
          purchaseId: purchase.id,
          variantId: r.variantId,
          qty: round3(r.qty),
          purchasePrice: round2(r.price),
          subtotal: round2(r.qty * r.price),
        },
      });

      // Receive: stock up, weighted-average cost re-based. From zero stock the
      // average is simply the price paid — but it is *computed*, not asserted.
      await tx.productVariant.update({
        where: { id: r.variantId },
        data: {
          stockQty: round3(r.qty),
          purchasePrice: avgAfterPurchase(0, 0, r.qty, r.price),
          lastPurchasePrice: round2(r.price),
        },
      });

      await tx.stockMovement.create({
        data: {
          variantId: r.variantId,
          type: "PURCHASE",
          qty: round3(r.qty),
          refType: "purchase",
          refId: purchase.id,
        },
      });
    }

    await tx.payment.create({
      data: {
        direction: "OUT",
        amount: paid,
        method: "Cash",
        accountId: cashAccountId,
        contactId: supplier.id,
        purchaseId: purchase.id,
        note: "Purchase payment",
      },
    });
    await tx.account.update({
      where: { id: cashAccountId },
      data: { balance: { decrement: paid } },
    });
  });

  const variants = await prisma.productVariant.count();
  console.log(
    `Demo catalogue: ${products.length} products / ${variants} variants; ` +
      `PUR-00001 brought in stock for ${total.toFixed(2)}, paid in cash.`,
  );
}

async function main() {
  const { branch, cash } = await seedBase();
  console.log(
    "Base: Main Store, Admin/Cashier roles + users, Cash + Bank accounts, " +
      "return reasons, walk-in customer, settings row.",
  );
  await seedDemo(branch.id, cash.id);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
