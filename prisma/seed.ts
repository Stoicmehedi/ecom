// prisma/seed.ts — idempotent base-data seed.
// Run: npx tsx prisma/seed.ts   (or: npx prisma db seed)
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
// tsx does NOT resolve the "@/..." alias — use the relative generated-client path.
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Small, sensible permission set for a cashier (module.action keys).
const CASHIER_PERMISSIONS = [
  "pos.access",
  "sales.create",
  "sales.view",
  "products.view",
  "contacts.view",
];

async function main() {
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

  await prisma.role.upsert({
    where: { name: "Cashier" },
    update: { permissions: CASHIER_PERMISSIONS },
    create: { name: "Cashier", permissions: CASHIER_PERMISSIONS },
  });

  // --- Admin user (User.username is unique → upsert) ---
  const passwordHash = bcrypt.hashSync("admin123", 10);
  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      name: "Administrator",
      passwordHash,
      isActive: true,
      roleId: adminRole.id,
      branchId: branch.id,
    },
    create: {
      name: "Administrator",
      username: "admin",
      passwordHash,
      isActive: true,
      roleId: adminRole.id,
      branchId: branch.id,
    },
  });

  // --- Cash account (no unique field → findFirst then create) ---
  const cash = await prisma.account.findFirst({
    where: { name: "Cash", type: "CASH" },
  });
  if (!cash) {
    await prisma.account.create({ data: { name: "Cash", type: "CASH" } });
  }

  const bank = await prisma.account.findFirst({
    where: { name: "Bank", type: "BANK" },
  });
  if (!bank) {
    await prisma.account.create({ data: { name: "Bank", type: "BANK" } });
  }

  // --- Purchase-return reasons (ReturnType.name is unique → upsert) ---
  for (const name of ["Damaged", "Wrong item", "Excess", "Expired"]) {
    await prisma.returnType.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // --- Walk-in customer (POS default; no unique field → findFirst then create) ---
  const walkIn = await prisma.contact.findFirst({ where: { isWalkIn: true } });
  if (!walkIn) {
    await prisma.contact.create({
      data: { type: "CUSTOMER", name: "Walk-in customer", isWalkIn: true },
    });
  }

  console.log(
    "Seed complete: Main Store, Admin/Cashier roles, admin user, Cash + Bank accounts, return types, walk-in customer.",
  );
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
