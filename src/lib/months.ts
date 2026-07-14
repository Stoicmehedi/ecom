/**
 * Month names, in one place.
 *
 * Not in the salary screen's client file: a value exported from a `"use client"`
 * module reaches a server component as a *reference*, not as the array — so the
 * server would read `undefined` out of it and print a heading with no month in it.
 * (It did, once.)
 */
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** "September 2025" — how a month is named to a person. */
export const monthLabel = (month: number, year: number) =>
  `${MONTHS[month - 1] ?? month} ${year}`;

/** The last day of a month, as `yyyy-mm-dd`: when wages are actually handed over. */
export function monthEnd(month: number, year: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}
