/**
 * UI-preference constants shared between the server (which reads the cookie to
 * paint the first frame correctly) and the client (which writes it on toggle).
 *
 * This lives in a plain module on purpose: a constant exported from a
 * `"use client"` file reads back as `undefined` when a Server Component imports
 * it, so the shared key must not sit in one.
 */
export const SIDEBAR_COOKIE = "sidebar_collapsed";
