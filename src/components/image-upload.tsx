"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { discardUpload, uploadImage } from "@/app/(app)/uploads/actions";
import { fileUrl } from "@/lib/files";
import { Button } from "@/components/ui/button";

/**
 * Pick an image, upload it, hold the key (BLUEPRINT §28).
 *
 * The key is handed back to the form, which saves it with the record. Nothing here is
 * trusted: the server sniffs the bytes, caps the size, and names the file itself.
 */
export function ImageUpload({
  folder,
  value,
  onChange,
  label = "Image",
  hint,
}: {
  folder: "logo" | "products";
  /** The stored key, or null. */
  value: string | null;
  onChange: (key: string | null) => void;
  label?: string;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  // Keys this form minted and then dropped without saving. Uploading twice, or picking a
  // photo and pressing Remove, would otherwise leave a file nothing points at (§28.2).
  const mine = useRef<Set<string>>(new Set());

  function forget(key: string | null) {
    if (key && mine.current.has(key)) {
      mine.current.delete(key);
      void discardUpload(key);
    }
  }

  const src = preview ?? fileUrl(value);

  function pick(file: File | undefined) {
    if (!file) return;
    // Show it straight away; the upload can take a moment on a shop's connection.
    setPreview(URL.createObjectURL(file));

    start(async () => {
      const form = new FormData();
      form.set("folder", folder);
      form.set("file", file);
      const res = await uploadImage(form);

      setPreview(null);
      if (res.error || !res.key) {
        toast.error(res.error ?? "Upload failed.");
        return;
      }
      forget(value); // the one this replaces, if we uploaded that too and never saved it
      mine.current.add(res.key);
      onChange(res.key);
    });
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>

      <div className="flex items-center gap-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted/40">
          {src ? (
            <Image
              src={src}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-muted-foreground">
              None
            </span>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={input}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => input.current?.click()}
            >
              {pending ? "Uploading…" : src ? "Replace" : "Upload"}
            </Button>
            {value && !pending && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  forget(value);
                  onChange(null);
                  if (input.current) input.current.value = "";
                }}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {hint ?? "PNG, JPEG or WebP, up to 2 MB."}
          </p>
        </div>
      </div>
    </div>
  );
}
