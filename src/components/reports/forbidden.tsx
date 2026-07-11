import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Reports need `reports.view`; the profit ones need `reports.profit` on top
 * (BLUEPRINT §11.2). The same two keys gate the export API.
 */
export function Forbidden({ kind = "profit" }: { kind?: "profit" | "reports" }) {
  const profit = kind === "profit";
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 rounded-lg border py-16 text-center">
      <Lock className="size-8 text-muted-foreground" />
      <div>
        <h1 className="text-lg font-semibold">
          {profit ? "Administrators only" : "You don't have access to reports"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {profit
            ? "Cost, profit and margin figures are restricted. Ask an administrator if you need this report."
            : "Ask an administrator to grant you access to reporting."}
        </p>
      </div>
      <Button variant="outline" asChild>
        <Link href={profit ? "/reports" : "/dashboard"}>
          {profit ? "Back to reports" : "Back to dashboard"}
        </Link>
      </Button>
    </div>
  );
}
