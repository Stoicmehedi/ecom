import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const session = await auth();
  // Settings change money rules, so the page is Admin-only — and so is the action
  // behind it (BLUEPRINT §17.3).
  if (!hasPermission(session, "settings.manage")) redirect("/dashboard");

  const settings = await getSettings();

  // The last invoice issued, so the numbering preview can show the number the next sale
  // will actually take — a start number below what is already issued is overtaken, not
  // re-used (§26.2), and that should be visible before it is saved, not after.
  const lastSale = await prisma.sale.findFirst({
    orderBy: { id: "desc" },
    select: { invoiceNo: true },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Shop-wide rules. These take effect on the next sale.
        </p>
      </div>
      <SettingsForm settings={settings} lastInvoiceNo={lastSale?.invoiceNo ?? null} />
    </div>
  );
}
