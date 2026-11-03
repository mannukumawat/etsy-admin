import { useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatShortDate } from '@/utils/dates';
import { formatUsd } from '@/utils/money';
import { cn } from '@/utils/misc';

// Charts follow the dataviz rules: one series per chart (no dual axis), 2px line + ~10% area wash,
// hairline gridlines, crosshair + tooltip that also works from the keyboard, and a table view.

const SERIES = '#C04A17'; // brand.600 — validated against the white chart surface
const GRID = '#E7DDCF';

function niceMax(v: number): number {
  if (v <= 0) return 100;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

const compactUsd = (minor: number) => {
  const v = minor / 100;
  if (v >= 1000) return `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(v)}`;
};

export interface SalesPoint {
  date: string;
  netUsd: number;
  orders: number;
}

/** Net paid revenue per day (USD). Orders count appears in the tooltip and table, not on a second axis. */
export function SalesChart({ points, title }: { points: SalesPoint[]; title: string }) {
  const W = 720;
  const H = 240;
  const pad = { l: 48, r: 12, t: 12, b: 28 };
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const titleId = useId();

  const max = niceMax(Math.max(...points.map((p) => p.netUsd), 0));
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  const { line, area } = useMemo(() => {
    const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.netUsd).toFixed(1)}`);
    const l = pts.length ? `M${pts.join('L')}` : '';
    const a = pts.length ? `${l}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
    return { line: l, area: a };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, max]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.l) / innerW) * (points.length - 1));
    setActive(Math.min(points.length - 1, Math.max(0, i)));
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? points.length) - 1));
    else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
  };

  const last = points[points.length - 1];
  const a = active !== null ? points[active] : null;

  return (
    <figure aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        {title}. Use left and right arrow keys to read daily values, or open the table view.
      </figcaption>
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          role="img"
          aria-label={title}
          tabIndex={0}
          onPointerMove={onMove}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-ink-muted text-[11px] num">
                {compactUsd(t)}
              </text>
            </g>
          ))}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === points.length - 1 ? (
              <text key={p.date} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="fill-ink-muted text-[11px]">
                {formatShortDate(p.date)}
              </text>
            ) : null,
          )}
          <path d={area} fill={SERIES} fillOpacity={0.1} />
          <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={x(points.length - 1)} cy={y(last.netUsd)} r={4} fill={SERIES} stroke="#fff" strokeWidth={2} />}
          {a && active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={pad.t} y2={pad.t + innerH} stroke="#8C8279" strokeWidth={1} />
              <circle cx={x(active)} cy={y(a.netUsd)} r={5} fill={SERIES} stroke="#fff" strokeWidth={2} />
            </g>
          )}
        </svg>
        {a && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-2 rounded-lg border border-sand-200 bg-white px-3 py-2 text-xs shadow-lift"
            style={{ left: `${(x(active) / W) * 100}%`, transform: `translateX(${active > points.length / 2 ? 'calc(-100% - 10px)' : '10px'})` }}
          >
            <p className="text-ink-muted">{formatShortDate(a.date)}</p>
            <p className="mt-0.5 flex items-center gap-2">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES }} aria-hidden />
              <strong className="text-sm text-ink num">{formatUsd(a.netUsd)}</strong> <span className="text-ink-muted">net revenue</span>
            </p>
            <p className="mt-0.5 text-ink-muted">
              {a.orders} order{a.orders === 1 ? '' : 's'} placed
            </p>
          </div>
        )}
      </div>
      <button type="button" className="mt-2 text-xs font-medium text-brand-700 underline underline-offset-2" aria-expanded={showTable} onClick={() => setShowTable((v) => !v)}>
        {showTable ? 'Hide table view' : 'Show table view'}
      </button>
      {showTable && (
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-sand-200">
          <table className="w-full text-xs">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-ivory-50 text-ink-muted">
              <tr>
                <th scope="col" className="px-3 py-1.5 text-left font-medium">Date</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Net revenue (USD)</th>
                <th scope="col" className="px-3 py-1.5 text-right font-medium">Orders</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date} className="border-t border-sand-200/70">
                  <td className="px-3 py-1">{formatShortDate(p.date)}</td>
                  <td className="px-3 py-1 text-right num">{formatUsd(p.netUsd)}</td>
                  <td className="px-3 py-1 text-right num">{p.orders}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

/** Horizontal bars with the value at the tip. Labels and values are always visible text (no tooltip gating). */
export function BarList({ items, valueLabel }: { items: Array<{ key: string; label: string; value: number; display: string; sub?: string; href?: string }>; valueLabel: string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-3" aria-label={valueLabel}>
      {items.map((it) => (
        <li key={it.key}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-ink">{it.href ? <a href={it.href} className="hover:underline">{it.label}</a> : it.label}</span>
            <span className="shrink-0 text-ink num">{it.display}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 flex-1 rounded-sm bg-ivory-200">
              <div className={cn('h-2 rounded-r-[4px]')} style={{ width: `${Math.max(2, (it.value / max) * 100)}%`, background: SERIES }} />
            </div>
            {it.sub && <span className="w-16 shrink-0 text-right text-xs text-ink-muted num">{it.sub}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}
