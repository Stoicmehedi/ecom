import { cn } from "@/lib/utils";

export function MposLogo({
  className,
  showWordmark = true,
}: {
  className?: string;
  showWordmark?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="size-5"
          aria-hidden="true"
        >
          {/* Original MPoS mark: stylized "M" as a receipt/peak */}
          <path
            d="M4 19V7l4 4 4-6 4 6 4-4v12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      {showWordmark && (
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight">MPoS</div>
          <div className="text-[11px] text-muted-foreground">
            Point of Sale
          </div>
        </div>
      )}
    </div>
  );
}
