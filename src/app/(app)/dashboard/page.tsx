import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Package, Layers, Contact, Receipt } from "lucide-react";

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

export default async function DashboardPage() {
  const status = await getStatus();

  const stats = status.ok
    ? [
        { label: "Products", value: status.products, icon: Package },
        { label: "Variants", value: status.variants, icon: Layers },
        { label: "Contacts", value: status.contacts, icon: Contact },
        { label: "Sales", value: status.sales, icon: Receipt },
      ]
    : [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to MPoS
          </h1>
          <p className="text-sm text-muted-foreground">
            Ring up sales, track stock, and know your numbers.
          </p>
        </div>
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium " +
            (status.ok
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive")
          }
        >
          <span
            className={
              "size-1.5 rounded-full " +
              (status.ok ? "bg-primary" : "bg-destructive")
            }
          />
          {status.ok ? "Database connected" : "Database unavailable"}
        </span>
      </div>

      {status.ok && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon }) => (
            <Card key={label}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardDescription>{label}</CardDescription>
                  <Icon className="size-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>
            A fast, single-store retail POS and inventory system.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Phase 1 in progress · Next.js + PostgreSQL + Prisma. Use the sidebar
          to navigate. The POS and catalog modules land in upcoming slices.
        </CardContent>
      </Card>
    </div>
  );
}
