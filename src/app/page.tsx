import { prisma } from "@/lib/prisma";

async function getStatus() {
  try {
    const [products, variants, contacts, sales] = await Promise.all([
      prisma.product.count(),
      prisma.productVariant.count(),
      prisma.contact.count(),
      prisma.sale.count(),
    ]);
    return { ok: true as const, products, variants, contacts, sales };
  } catch {
    return { ok: false as const };
  }
}

export default async function Home() {
  const status = await getStatus();

  return (
    <main className="flex flex-1 items-center justify-center bg-neutral-50 px-6 py-16 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="w-full max-w-2xl">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 font-bold text-white shadow-sm">
            M
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">MPoS</h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Point of Sale &amp; Inventory
            </p>
          </div>
        </div>

        <p className="mt-8 text-lg leading-relaxed text-neutral-600 dark:text-neutral-300">
          A fast, single-store retail POS and inventory system. Ring up sales,
          track stock, and know your numbers.
        </p>

        {/* System status */}
        <div className="mt-10 rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              System status
            </h2>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
                (status.ok
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400")
              }
            >
              <span
                className={
                  "h-1.5 w-1.5 rounded-full " +
                  (status.ok ? "bg-emerald-500" : "bg-red-500")
                }
              />
              {status.ok ? "Database connected" : "Database unavailable"}
            </span>
          </div>

          {status.ok && (
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Products" value={status.products} />
              <Stat label="Variants" value={status.variants} />
              <Stat label="Contacts" value={status.contacts} />
              <Stat label="Sales" value={status.sales} />
            </dl>
          )}
        </div>

        <p className="mt-8 text-xs text-neutral-400 dark:text-neutral-600">
          Phase 1 in progress · Next.js + PostgreSQL + Prisma
        </p>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-3 dark:bg-neutral-950">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
