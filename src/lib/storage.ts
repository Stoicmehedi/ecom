/**
 * Uploaded files (BLUEPRINT §28).
 *
 * They live on local disk, in a writable directory **outside `public/`** — Next.js serves
 * `public/` as a build-time asset directory, so a file written there at runtime is not
 * reliably served and is lost on the next rebuild. The DB stores a **key**, never a URL,
 * and `/api/files/<key>` serves the bytes.
 *
 * Everything goes through this module, so the day the shop outgrows one machine, an S3
 * driver is a new file rather than a migration.
 *
 * Server-only: it touches the filesystem.
 */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.env.UPLOAD_DIR ?? "./data/uploads");

/** The folders we write to. A key is `<folder>/<random>.<ext>` and nothing else. */
export type Folder = "logo" | "products";

/** 2 MB. A shop photograph does not need more, and an upload route is a free disk. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

const TYPES = [
  { ext: "png", mime: "image/png", magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "jpg", mime: "image/jpeg", magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", magic: (b: Buffer) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
] as const;

/**
 * What the bytes actually are — never what the browser said they are.
 *
 * The declared MIME type and the filename extension are both attacker-controlled; the
 * magic number is not. The extension we store is derived from this, not from the upload.
 */
function sniff(bytes: Buffer) {
  return TYPES.find((t) => t.magic(bytes)) ?? null;
}

/** A key we are willing to touch the disk with: `products/<32 hex>.<ext>`, nothing else. */
const KEY = /^(logo|products)\/[a-f0-9]{32}\.(png|jpg|webp)$/;

export function isValidKey(key: string): boolean {
  return KEY.test(key);
}

export type SaveResult = { key?: string; error?: string };

/** Write an uploaded image and return its key. Refuses anything that is not really an image. */
export async function saveImage(file: File, folder: Folder): Promise<SaveResult> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `Images must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.` };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return { error: "That is not a PNG, JPEG or WebP image." };

  // The stored name is ours, never the user's — a filename can carry `../`, a null byte,
  // or a collision with somebody else's file.
  const key = `${folder}/${randomBytes(16).toString("hex")}.${type.ext}`;
  const dest = path.join(ROOT, key);

  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, bytes);
  return { key };
}

/** The bytes behind a key, or null. Validates the key before it goes near the disk. */
export async function readImage(
  key: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (!isValidKey(key)) return null;

  const ext = key.split(".").pop();
  const type = TYPES.find((t) => t.ext === ext);
  if (!type) return null;

  try {
    const bytes = await readFile(path.join(ROOT, key));
    return { bytes, contentType: type.mime };
  } catch {
    return null;
  }
}

/**
 * Copy a file to a key of its own.
 *
 * Duplicating a product must **not** hand the copy the original's key: the two records
 * would share one file, and deleting either would take the other's picture with it.
 * Returns null if there is nothing to copy.
 */
export async function copyImage(key: string | null | undefined): Promise<string | null> {
  if (!key || !isValidKey(key)) return null;

  const file = await readImage(key);
  if (!file) return null;

  const [folder, name] = key.split("/");
  const ext = name.split(".").pop()!;
  const dest = `${folder}/${randomBytes(16).toString("hex")}.${ext}`;

  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, dest), file.bytes);
  return dest;
}

/**
 * Delete a file. Silent if it is already gone — a replaced image and a deleted product
 * both come through here, and a missing file is not a reason to fail either of them.
 */
export async function deleteImage(key: string | null | undefined): Promise<void> {
  if (!key || !isValidKey(key)) return;
  try {
    await unlink(path.join(ROOT, key));
  } catch {
    // already gone
  }
}
