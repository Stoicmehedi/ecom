/**
 * Reading an id out of a `<Select>` (BLUEPRINT §12.11).
 *
 * ⚠️ **`Number("") === 0`.** Radix fires `onValueChange("")` while a select settles on
 * mount, so the obvious `Number(v)` quietly hands the form **id 0** — an id no row can
 * have. That is how *every categorised product became impossible to edit*: the save died
 * on a foreign key and the screen said only "something went wrong".
 *
 * An empty event is the widget talking to itself, not the user choosing something. So:
 *
 * - `""` → `undefined` — **ignore it**, keep whatever was picked.
 * - a sentinel (`"none"`, `"all"`) → `null` — the user really did clear it.
 * - anything else → a positive integer id, or `undefined` if it is not one.
 */
export function selectId(
  v: string,
  clearOn: string[] = ["none", "all"],
): number | null | undefined {
  if (v === "") return undefined;
  if (clearOn.includes(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
