import { cn } from "@/lib/utils";

export function MposLogo({
  className,
  showWordmark = true,
  logoUrl,
}: {
  className?: string;
  showWordmark?: boolean;
  /**
   * The shop's own uploaded logo (§28). When set it replaces the default MPoS
   * mark in the sidebar, the collapsed rail, the mobile header and the login
   * screen. `null`/omitted falls back to the built-in mark, so a shop that has
   * not set a logo still has a brand.
   */
  logoUrl?: string | null;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {logoUrl ? (
        // A plain <img>, not next/image: this same component renders inside four
        // different client trees, and the logo is a small, already-sized asset.
        // object-contain never crops, so a wide logo shows whole rather than cut.
        <span className="block size-9 overflow-hidden rounded-lg bg-card shadow-sm ring-1 ring-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl} alt="" className="size-full object-contain p-[3px]" />
        </span>
      ) : (
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
      )}
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
