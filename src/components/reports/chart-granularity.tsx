"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SeriesBucket } from "@/lib/reports/queries";

/** Group the overview chart by day / week / month. The choice lives in the URL. */
export function ChartGranularity({ bucket }: { bucket: SeriesBucket }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(value: string) {
    const q = new URLSearchParams(params.toString());
    q.set("bucket", value);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <Select value={bucket} onValueChange={set}>
      <SelectTrigger className="h-8 w-[7.5rem]" aria-label="Group chart by">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="day">By day</SelectItem>
        <SelectItem value="week">By week</SelectItem>
        <SelectItem value="month">By month</SelectItem>
      </SelectContent>
    </Select>
  );
}
