import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import { PageHeader } from "@/components/app/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  activityActors,
  activityHref,
  parseActivityFilters,
  queryActivity,
  type ActivityRow,
} from "@/lib/activity-query";
import { ActivityFilters } from "./filters";
import { ActivityExportButtons } from "./export-buttons";

const actionTone: Record<string, string> = {
  Created: "text-primary",
  Updated: "text-amber-600 dark:text-amber-500",
  Deleted: "text-destructive",
};

function when(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Gated on the page and — the one that actually holds — the export route (§29.3).
  const session = await auth();
  if (!hasPermission(session, "activity.view")) redirect("/dashboard");

  const params = await searchParams;
  const filters = parseActivityFilters(params);
  const [{ rows, total, page, perPage, pageCount }, actors] = await Promise.all([
    queryActivity(filters),
    activityActors(),
  ]);

  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div className="activity-root mx-auto w-full max-w-7xl space-y-6">
      {/* Print yields the log itself, not the sidebar or the controls (same trick as reports). */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .activity-root, .activity-root * { visibility: visible !important; }
          .activity-root {
            position: absolute; left: 0; top: 0;
            width: 100%; max-width: none; margin: 0; padding: 8mm;
          }
          .no-print { display: none !important; }
          thead { display: table-header-group; }
          tr { break-inside: avoid; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <PageHeader
        title="Activity log"
        description="Who did what, and when. Every write is here; history is kept in full."
      >
        <ActivityExportButtons />
      </PageHeader>

      <ActivityFilters
        actors={actors}
        userId={filters.userId}
        module={filters.module}
        action={filters.action}
        from={filters.from}
        to={filters.to}
        search={filters.search}
        perPage={perPage}
      />

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Module</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="no-print text-right">View</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No activity matches these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => (
                <ActivityTableRow key={r.id} row={r} sl={first + i} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {total === 0
            ? "No entries"
            : `Showing ${first}–${last} of ${total.toLocaleString()}`}
        </p>
        {pageCount > 1 && (
          <Pager page={page} pageCount={pageCount} params={params} />
        )}
      </div>
    </div>
  );
}

function ActivityTableRow({ row, sl }: { row: ActivityRow; sl: number }) {
  const href = activityHref(row);
  return (
    <TableRow>
      <TableCell className="text-muted-foreground tabular-nums">{sl}</TableCell>
      <TableCell className="font-medium">{row.userName}</TableCell>
      <TableCell>
        <Badge variant="secondary" className="font-normal">
          {row.module}
        </Badge>
      </TableCell>
      <TableCell className="max-w-md">{row.details}</TableCell>
      <TableCell className={cn("font-medium", actionTone[row.action])}>
        {row.action}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {when(row.createdAt)}
      </TableCell>
      <TableCell className="no-print text-right">
        {href ? (
          <Link href={href} className="text-primary hover:underline">
            View
          </Link>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function Pager({
  page,
  pageCount,
  params,
}: {
  page: number;
  pageCount: number;
  params: Record<string, string | string[] | undefined>;
}) {
  const to = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === "page") continue;
      if (typeof v === "string") q.set(k, v);
    }
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `?${s}` : "?";
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
        {page > 1 ? <Link href={to(page - 1)}>Previous</Link> : <span>Previous</span>}
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">
        Page {page} of {pageCount}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= pageCount}
        asChild={page < pageCount}
      >
        {page < pageCount ? <Link href={to(page + 1)}>Next</Link> : <span>Next</span>}
      </Button>
    </div>
  );
}
