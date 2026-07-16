export function PageHeader({
  title,
  description,
  eyebrow,
  children,
}: {
  title: string;
  description?: string;
  /** A small uppercase label above the title — the section this page belongs to. */
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    // `min-w-0` on the title block: a flex child defaults to min-width:auto, so
    // a long description would otherwise hold the header open wider than the
    // phone it is on rather than wrapping inside it.
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        {eyebrow && (
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-[13px] text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
