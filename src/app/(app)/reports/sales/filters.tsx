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

export function SalesFilters({
  groupBy,
  status,
}: {
  groupBy: string;
  status: string | undefined;
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
      <Select value={groupBy} onValueChange={(v) => set("groupBy", v)}>
        <SelectTrigger size="sm" className="w-[10rem]">
          <SelectValue placeholder="Group by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="invoice">Per invoice</SelectItem>
          <SelectItem value="day">By day</SelectItem>
          <SelectItem value="month">By month</SelectItem>
        </SelectContent>
      </Select>

      <Select value={status ?? ALL} onValueChange={(v) => set("status", v)}>
        <SelectTrigger size="sm" className="w-[10rem]">
          <SelectValue placeholder="Any status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Any status</SelectItem>
          <SelectItem value="PAID">Paid</SelectItem>
          <SelectItem value="PARTIAL">Partly paid</SelectItem>
          <SelectItem value="DUE">Unpaid</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
