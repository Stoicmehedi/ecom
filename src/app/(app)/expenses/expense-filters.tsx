"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RangePicker } from "@/components/reports/range-picker";
import type { DateRange } from "@/lib/reports/range";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

export function ExpenseFilters({
  range,
  types,
  selectedType,
}: {
  range: DateRange;
  types: { id: number; name: string }[];
  selectedType?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setType(value: string) {
    const q = new URLSearchParams(params.toString());
    if (value === ALL) q.delete("type");
    else q.set("type", value);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <RangePicker range={range} />

      <Select value={selectedType ? String(selectedType) : ALL} onValueChange={setType}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder="All types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All types</SelectItem>
          {types.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
