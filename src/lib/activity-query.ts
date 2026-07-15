import "server-only";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_MODULES,
  PER_PAGE_OPTIONS,
  type ActivityAction,
  type ActivityModule,
} from "@/lib/activity-constants";
import type { ReportTable } from "@/lib/reports/types";

export type ActivityFilters = {
  userId?: number;
  module?: ActivityModule;
  action?: ActivityAction;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  search?: string;
  page: number;
  perPage: number;
};

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const isDateStr = (s: string | undefined): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Read filters out of the URL. Everything is optional — the default view is
 *  "the most recent activity, newest first", with no date window forced. */
export function parseActivityFilters(
  params: Record<string, string | string[] | undefined>,
): ActivityFilters {
  const userIdRaw = Number(one(params.userId));
  const moduleRaw = one(params.module);
  const actionRaw = one(params.action);
  const from = one(params.from);
  const to = one(params.to);
  const search = one(params.search)?.trim() || undefined;

  const perPageRaw = Number(one(params.perPage));
  const perPage = (PER_PAGE_OPTIONS as readonly number[]).includes(perPageRaw)
    ? perPageRaw
    : 20;

  const pageRaw = Number(one(params.page));
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  return {
    userId: Number.isInteger(userIdRaw) && userIdRaw > 0 ? userIdRaw : undefined,
    module: (ACTIVITY_MODULES as readonly string[]).includes(moduleRaw ?? "")
      ? (moduleRaw as ActivityModule)
      : undefined,
    action: (ACTIVITY_ACTIONS as readonly string[]).includes(actionRaw ?? "")
      ? (actionRaw as ActivityAction)
      : undefined,
    from: isDateStr(from) ? from : undefined,
    to: isDateStr(to) ? to : undefined,
    search,
    page,
    perPage,
  };
}

/** Local-time day bounds, so a shop's "from/to" means the days it is standing in. */
function dayStart(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function dayEnd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999);
}

function whereFor(f: ActivityFilters): Prisma.ActivityLogWhereInput {
  const where: Prisma.ActivityLogWhereInput = {};
  if (f.userId) where.userId = f.userId;
  if (f.module) where.module = f.module;
  if (f.action) where.action = f.action;
  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = dayStart(f.from);
    if (f.to) where.createdAt.lte = dayEnd(f.to);
  }
  if (f.search) {
    where.OR = [
      { details: { contains: f.search, mode: "insensitive" } },
      { docNo: { contains: f.search, mode: "insensitive" } },
      { userName: { contains: f.search, mode: "insensitive" } },
    ];
  }
  return where;
}

export type ActivityRow = {
  id: number;
  userName: string;
  module: string;
  action: string;
  details: string;
  docType: string | null;
  docNo: string | null;
  docId: number | null;
  createdAt: Date;
};

export type ActivityPage = {
  rows: ActivityRow[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

export async function queryActivity(f: ActivityFilters): Promise<ActivityPage> {
  const where = whereFor(f);
  const total = await prisma.activityLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / f.perPage));
  const page = Math.min(f.page, pageCount);

  const rows = await prisma.activityLog.findMany({
    where,
    orderBy: { id: "desc" }, // newest first; id ties-break same-second events
    skip: (page - 1) * f.perPage,
    take: f.perPage,
    select: {
      id: true,
      userName: true,
      module: true,
      action: true,
      details: true,
      docType: true,
      docNo: true,
      docId: true,
      createdAt: true,
    },
  });

  return { rows, total, page, perPage: f.perPage, pageCount };
}

/** The users who have actually done something — the filter only offers real actors. */
export async function activityActors(): Promise<{ id: number; name: string }[]> {
  const grouped = await prisma.activityLog.groupBy({
    by: ["userId", "userName"],
    where: { userId: { not: null } },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
  });
  const seen = new Set<number>();
  const actors: { id: number; name: string }[] = [];
  for (const g of grouped) {
    if (g.userId == null || seen.has(g.userId)) continue;
    seen.add(g.userId);
    actors.push({ id: g.userId, name: g.userName });
  }
  return actors;
}

/** Where the View link points — only for documents that still exist and have a
 *  detail page. A deleted document (or one with no viewable page) gets no link,
 *  exactly like the reference app's empty View cell. */
const DOC_HREF: Record<string, (id: number) => string> = {
  sales: (id) => `/sales/${id}`,
  purchases: (id) => `/purchases/${id}`,
  products: (id) => `/products/${id}/edit`,
  customers: (id) => `/customers/${id}`,
  suppliers: (id) => `/suppliers/${id}`,
  accounts: (id) => `/accounts/${id}`,
};

export function activityHref(row: ActivityRow): string | null {
  if (row.action === "Deleted") return null; // the document is gone — nothing to view
  if (!row.docType || row.docId == null) return null;
  const make = DOC_HREF[row.docType];
  return make ? make(row.docId) : null;
}

/** The export table (BLUEPRINT §29.3) — CSV/Excel render from this, so a download
 *  is exactly the log on screen. No View column: a link does not belong in a file. */
export function activityTable(rows: ActivityRow[]): ReportTable {
  const fmt = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  return {
    title: "Activity log",
    columns: [
      { key: "when", label: "Date", type: "text" },
      { key: "user", label: "User", type: "text" },
      { key: "module", label: "Module", type: "text" },
      { key: "action", label: "Action", type: "text" },
      { key: "details", label: "Details", type: "text" },
    ],
    rows: rows.map((r) => ({
      when: fmt(r.createdAt),
      user: r.userName,
      module: r.module,
      action: r.action,
      details: r.details,
    })),
  };
}
