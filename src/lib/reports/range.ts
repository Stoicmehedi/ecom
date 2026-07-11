/**
 * The date range every report shares.
 *
 * Ranges are inclusive of both ends and expressed in the server's local time —
 * a shop's "today" is the day it is standing in, not a UTC window.
 */

export type Preset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "last-month"
  | "year"
  | "custom";

export type DateRange = {
  from: Date;
  to: Date;
  preset: Preset;
  /** `YYYY-MM-DD`, for round-tripping through the URL and <input type="date">. */
  fromStr: string;
  toStr: string;
  label: string;
};

/**
 * The widest range any report will answer, in days.
 *
 * A hand-edited `?from=1900-01-01` would otherwise make the overview build one
 * bar per day for a century and take the page down. A year is more than any
 * preset asks for, so nothing legitimate is clipped.
 */
export const MAX_RANGE_DAYS = 366;

export const PRESETS: { value: Preset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "year", label: "This year" },
];

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `YYYY-MM-DD` → local Date, or null. Avoids `new Date(str)`, which parses as UTC. */
function parseDateStr(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function presetRange(preset: Preset, now: Date): { from: Date; to: Date } {
  switch (preset) {
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { from: y, to: y };
    }
    case "week": {
      // Week starts Monday.
      const from = new Date(now);
      const dow = (from.getDay() + 6) % 7;
      from.setDate(from.getDate() - dow);
      return { from, to: now };
    }
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
    case "last-month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0); // day 0 = last of prev month
      return { from, to };
    }
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    case "today":
    default:
      return { from: now, to: now };
  }
}

/**
 * Read a range out of the URL. An explicit `from`/`to` wins and reads as
 * "custom"; otherwise `preset` decides; the default is Today.
 */
export function parseRange(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): DateRange {
  const one = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;

  const fromParam = parseDateStr(one(params.from));
  const toParam = parseDateStr(one(params.to));
  const presetParam = one(params.preset) as Preset | undefined;

  let preset: Preset;
  let from: Date;
  let to: Date;

  if (fromParam || toParam) {
    preset = "custom";
    from = fromParam ?? toParam!;
    to = toParam ?? fromParam!;
  } else {
    preset =
      presetParam && PRESETS.some((p) => p.value === presetParam)
        ? presetParam
        : "today";
    ({ from, to } = presetRange(preset, now));
  }

  // A backwards range is a typo, not an empty report.
  if (from > to) [from, to] = [to, from];

  let f = startOfDay(from);
  const t = endOfDay(to);

  // Clamp an over-wide range back from the end date, rather than refusing it.
  const span = Math.floor((t.getTime() - f.getTime()) / 86_400_000);
  let clamped = false;
  if (span >= MAX_RANGE_DAYS) {
    const earliest = new Date(t);
    earliest.setDate(earliest.getDate() - (MAX_RANGE_DAYS - 1));
    f = startOfDay(earliest);
    clamped = true;
  }

  return {
    from: f,
    to: t,
    preset,
    fromStr: toDateStr(f),
    toStr: toDateStr(t),
    label: rangeLabel(f, t, preset) + (clamped ? ` (capped at ${MAX_RANGE_DAYS} days)` : ""),
  };
}

function rangeLabel(from: Date, to: Date, preset: Preset): string {
  const known = PRESETS.find((p) => p.value === preset);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  const span = toDateStr(from) === toDateStr(to) ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
  return known ? `${known.label} · ${span}` : span;
}
