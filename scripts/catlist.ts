import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  const all = await prisma.category.findMany({ orderBy: [{ level: "asc" }, { name: "asc" }] });
  for (const c of all) console.log(`L${c.level} id=${c.id} parent=${c.parentId ?? "-"} ${c.name}`);
  await prisma.$disconnect();
}
main();
