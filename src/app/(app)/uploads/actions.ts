"use server";

import { requirePermission } from "@/lib/guard";
import { prisma } from "@/lib/prisma";
import { deleteImage, isValidKey, saveImage, type SaveResult } from "@/lib/storage";
import type { PermissionKey } from "@/lib/permissions";

/**
 * Upload an image and hand back its key (BLUEPRINT §28).
 *
 * The caller says what the image is *for*, and that decides the gate: a logo belongs to
 * Settings, a product photo to the catalogue. Same permission as the record it will hang
 * on — an upload endpoint anyone can post bytes to is a free disk.
 *
 * The key is not committed to anything yet; the form saves it with the record. An upload
 * the user then abandons leaves one orphan file, which is the right trade for not making
 * the user save a half-finished product just to attach a picture.
 */
const GATES: Record<"logo" | "products", PermissionKey> = {
  logo: "settings.manage",
  products: "products.manage",
};

/**
 * Throw away an upload nobody kept.
 *
 * Uploading twice on one form, or picking a photo and then pressing Remove, would
 * otherwise leave the first file on disk with nothing pointing at it forever. The form
 * only ever offers up keys **it minted this session**, and the server refuses to delete
 * a key that any record actually references — a discard must never be able to take a
 * live image with it.
 */
export async function discardUpload(key: string): Promise<{ ok: boolean }> {
  if (!isValidKey(key)) return { ok: false };

  const folder = key.split("/")[0] as "logo" | "products";
  const denied = await requirePermission(GATES[folder]);
  if (denied) return { ok: false };

  const inUse =
    (await prisma.product.count({ where: { imageKey: key } })) +
    (await prisma.shopSetting.count({ where: { logoKey: key } }));
  if (inUse > 0) return { ok: false };

  await deleteImage(key);
  return { ok: true };
}

export async function uploadImage(form: FormData): Promise<SaveResult> {
  const folder = String(form.get("folder"));
  if (folder !== "logo" && folder !== "products") {
    return { error: "Unknown upload." };
  }

  const denied = await requirePermission(GATES[folder]);
  if (denied) return { error: denied };

  const file = form.get("file");
  if (!(file instanceof File)) return { error: "No file was uploaded." };

  // Everything else — is it really an image, is it small enough, what is it named on
  // disk — is storage's business, and it does not trust the browser for any of it.
  return saveImage(file, folder);
}
