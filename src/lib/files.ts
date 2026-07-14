/**
 * Where an uploaded file is served from (BLUEPRINT §28).
 *
 * Split out of `storage.ts` — which touches `node:fs` and must never be pulled into a
 * client bundle — so the POS tiles and the product list can build an image URL too. Same
 * shape as `qty.ts` / `qty-server.ts`: the rule is shared, the filesystem is not.
 */

/** The key changes whenever the bytes do, so this URL is safe to cache forever. */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? `/api/files/${key}` : null;
}
