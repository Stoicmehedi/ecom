"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_MODULES,
  PER_PAGE_OPTIONS,
} from "@/lib/activity-constants";

const ALL = "all";

export function ActivityFilters({
  actors,
  userId,
  module,
  action,
  from,
  to,
  search,
  perPage,
}: {
  actors: { id: number; name: string }[];
  userId?: number;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
  perPage: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [term, setTerm] = useState(search ?? "");

  // Any filter change returns to page 1 — page 7 of the old filter is meaningless
  // under the new one.
  function set(next: Record<string, string | undefined>) {
    const q = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (!value || value === ALL) q.delete(key);
      else q.set(key, value);
    }
    q.delete("page");
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="no-print flex flex-wrap items-end gap-3">
      <Field label="Per page">
        <Select value={String(perPage)} onValueChange={(v) => set({ perPage: v })}>
          <SelectTrigger size="sm" className="w-[5.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PER_PAGE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="User">
        <Select
          value={userId ? String(userId) : ALL}
          onValueChange={(v) => set({ userId: v })}
        >
          <SelectTrigger size="sm" className="w-[10rem]">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All users</SelectItem>
            {actors.map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Module">
        <Select value={module ?? ALL} onValueChange={(v) => set({ module: v })}>
          <SelectTrigger size="sm" className="w-[11rem]">
            <SelectValue placeholder="All modules" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All modules</SelectItem>
            {ACTIVITY_MODULES.map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Action">
        <Select value={action ?? ALL} onValueChange={(v) => set({ action: v })}>
          <SelectTrigger size="sm" className="w-[9rem]">
            <SelectValue placeholder="Any action" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any action</SelectItem>
            {ACTIVITY_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="From">
        <Input
          type="date"
          value={from ?? ""}
          onChange={(e) => set({ from: e.target.value || undefined })}
          className="h-8 w-[9.5rem]"
        />
      </Field>

      <Field label="To">
        <Input
          type="date"
          value={to ?? ""}
          onChange={(e) => set({ to: e.target.value || undefined })}
          className="h-8 w-[9.5rem]"
        />
      </Field>

      <Field label="Search">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") set({ search: term.trim() || undefined });
          }}
          onBlur={() => {
            if ((term.trim() || undefined) !== (search ?? undefined)) {
              set({ search: term.trim() || undefined });
            }
          }}
          placeholder="Search activity…"
          className="h-8 w-[13rem]"
        />
      </Field>

      <Button variant="ghost" size="sm" asChild>
        <a href={pathname}>Reset</a>
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
