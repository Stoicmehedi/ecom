import { readImage } from "@/lib/storage";

/**
 * Serves an uploaded image (BLUEPRINT §28.2).
 *
 * Deliberately **not** signed-in only: the shop logo appears on the public invoice link
 * (§20.5), which a customer opens with no session. These are shop assets — a product photo
 * and a logo — not records about anybody.
 *
 * The key is validated inside `readImage` before the disk is touched, so a crafted path
 * cannot walk out of the uploads directory. An unknown or malformed key is a plain 404,
 * which tells a prober nothing.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const file = await readImage(key.join("/"));
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      // The name changes whenever the bytes do, so this can never serve a stale image.
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(file.bytes.length),
    },
  });
}
