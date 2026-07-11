"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

type Option = { id: number; name: string };

export function ProductFilters({
  categories,
  brands,
  categoryId,
  brandId,
}: {
  categories: Option[];
  brands: Option[];
  categoryId?: number;
  brandId?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string) {
    const q = new URLSearchParams(params.toString());
    if (value === ALL) q.delete(key);
    else q.set(key, value);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2">
      <Select
        value={categoryId ? String(categoryId) : ALL}
        onValueChange={(v) => set("categoryId", v)}
      >
        <SelectTrigger size="sm" className="w-[11rem]">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={brandId ? String(brandId) : ALL}
        onValueChange={(v) => set("brandId", v)}
      >
        <SelectTrigger size="sm" className="w-[11rem]">
          <SelectValue placeholder="All brands" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All brands</SelectItem>
          {brands.map((b) => (
            <SelectItem key={b.id} value={String(b.id)}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
