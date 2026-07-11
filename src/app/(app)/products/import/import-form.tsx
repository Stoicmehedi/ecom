"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileWarning, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { previewImport, runImport, type ImportPreview } from "./actions";
import { cn } from "@/lib/utils";

export function ImportForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setPreview(null);
    setError(null);

    startTransition(async () => {
      const res = await previewImport(text);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setPreview(res);
    });
  }

  function onApply() {
    if (!csv) return;
    startTransition(async () => {
      const res = await runImport(csv);
      if (res.ok) {
        toast.success(
          `Imported — ${res.created} created, ${res.updated} updated.`,
        );
        router.push("/products");
        router.refresh();
      } else {
        toast.error(res.error ?? "Import failed");
        setError(res.error ?? "Import failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <label
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-10 text-center transition-colors hover:bg-muted/40",
          csv && "border-primary/50 bg-primary/5",
        )}
      >
        <Upload className="size-7 text-muted-foreground" />
        <span className="font-medium">
          {fileName || "Choose a CSV file"}
        </span>
        <span className="text-sm text-muted-foreground">
          Export the catalogue first to get a file in the right shape — an export
          imports straight back.
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </label>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <FileWarning className="mt-0.5 size-4 shrink-0 text-destructive" />
          <span>{error}</span>
        </div>
      )}

      {preview && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Will create" value={preview.creates} tone="good" />
            <Stat label="Will update" value={preview.updates} />
            <Stat
              label="Skipped"
              value={preview.problems}
              tone={preview.problems > 0 ? "bad" : "muted"}
            />
          </div>

          {(preview.newCategories.length > 0 ||
            preview.newBrands.length > 0 ||
            preview.newUnits.length > 0 ||
            preview.newAttributes.length > 0 ||
            preview.newColors.length > 0) && (
            <div className="rounded-lg border p-4 text-sm">
              <p className="mb-2 font-medium">
                These will be created too, because rows refer to them:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.newCategories.map((c) => (
                  <Badge key={`c${c}`} variant="secondary">
                    category: {c}
                  </Badge>
                ))}
                {preview.newBrands.map((b) => (
                  <Badge key={`b${b}`} variant="secondary">
                    brand: {b}
                  </Badge>
                ))}
                {preview.newUnits.map((u) => (
                  <Badge key={`u${u}`} variant="secondary">
                    unit: {u}
                  </Badge>
                ))}
                {preview.newAttributes.map((a) => (
                  <Badge key={`a${a}`} variant="secondary">
                    {a}
                  </Badge>
                ))}
                {preview.newColors.map((c) => (
                  <Badge key={`col${c}`} variant="secondary">
                    colour: {c}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2 font-medium">Line</th>
                  <th className="p-2 font-medium">SKU</th>
                  <th className="p-2 font-medium">Name</th>
                  <th className="p-2 font-medium">Variant</th>
                  <th className="p-2 text-right font-medium">Cost</th>
                  <th className="p-2 text-right font-medium">Price</th>
                  <th className="p-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 100).map((r) => (
                  <tr
                    key={r.line}
                    className={cn("border-b last:border-0", r.problem && "bg-destructive/5")}
                  >
                    <td className="p-2 text-muted-foreground">{r.line}</td>
                    <td className="p-2 font-mono text-xs">{r.sku || "—"}</td>
                    <td className="p-2">{r.name || "—"}</td>
                    <td className="p-2 text-muted-foreground">{r.variant || "—"}</td>
                    <td className="p-2 text-right tabular-nums">{r.cost.toFixed(2)}</td>
                    <td className="p-2 text-right tabular-nums">{r.price.toFixed(2)}</td>
                    <td className="p-2">
                      {r.problem ? (
                        <span className="text-destructive">skipped — {r.problem}</span>
                      ) : r.action === "create" ? (
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                          create
                        </Badge>
                      ) : (
                        <Badge variant="secondary">update</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.rows.length > 100 && (
              <p className="border-t p-2 text-center text-xs text-muted-foreground">
                Showing the first 100 of {preview.rows.length} rows. All of them will be
                imported.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={onApply}
              disabled={pending || preview.creates + preview.updates === 0}
            >
              <CheckCircle2 className="size-4" />
              {pending
                ? "Importing…"
                : `Import ${preview.creates + preview.updates} row${
                    preview.creates + preview.updates === 1 ? "" : "s"
                  }`}
            </Button>
            <p className="text-sm text-muted-foreground">
              Stock is never imported — it moves through purchases, sales and returns.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "good" | "bad" | "muted";
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "good" && "text-primary",
          tone === "bad" && "text-destructive",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}
