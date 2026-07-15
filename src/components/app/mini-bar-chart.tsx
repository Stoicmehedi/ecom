/**
 * A small daily-trend chart drawn as inline SVG — no charting dependency, crisp at
 * any size, themed off the emerald primary (BLUEPRINT UI §). The same instinct the
 * codebase already uses for barcodes: draw it ourselves rather than ship a library.
 */
export function MiniBarChart({
  data,
  height = 72,
  format = (n) => n.toFixed(0),
}: {
  data: { label: string; value: number }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const n = data.length;
  // A viewBox in abstract units; the SVG scales to its container width.
  const W = Math.max(n * 10, 10);
  const gap = 0.28; // share of a slot left as gap
  const bw = 1 - gap;

  return (
    <svg
      viewBox={`0 0 ${W} 100`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label="Daily sales trend"
    >
      {data.map((d, i) => {
        const h = (d.value / max) * 92; // leave headroom
        const x = (i / n) * W + (gap / 2) * (W / n);
        const w = bw * (W / n);
        const y = 100 - h;
        return (
          <g key={d.label}>
            {/* track */}
            <rect x={x} y={4} width={w} height={96} rx={1.2} className="fill-muted" />
            {/* value */}
            <rect x={x} y={y} width={w} height={h} rx={1.2} className="fill-primary">
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          </g>
        );
      })}
    </svg>
  );
}
