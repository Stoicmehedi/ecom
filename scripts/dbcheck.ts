import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
  const n = await prisma.branch.count();
  console.log("DB_OK branch_count =", n);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("DB_FAIL", e);
  process.exit(1);
});
