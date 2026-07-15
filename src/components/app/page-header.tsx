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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-0.5">
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
