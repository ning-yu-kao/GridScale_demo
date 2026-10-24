import type { ReactNode } from 'react';
import { ExternalLink, Info } from 'lucide-react';
import type { DataSourceType } from '../types/simulator';
import { SOURCE_TYPE_INFO } from '../data/publicProfiles';

export const COLORS = {
  bg: '#0B1120',
  panel: '#111C2D',
  line: '#1E293B',
  accent: '#3B82F6',
  emerald: '#10B981',
  warn: '#F59E0B',
  danger: '#EF4444',
  slate: '#64748B',
  uniform: '#F59E0B',
  aware: '#10B981',
};

export const fmtKw = (kw: number, d = 1) =>
  Math.abs(kw) >= 1000 ? `${(kw / 1000).toFixed(2)} MW` : `${kw.toFixed(d)} kW`;
export const fmtPct = (v: number, d = 1) => `${v.toFixed(d)}%`;
export const fmtUsd = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(1)}K` : `$${v.toFixed(0)}`;

/* ------------------------------------------------------------------ */

export function Panel({
  title,
  icon,
  right,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-panel shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
            {icon && <span className="text-accent">{icon}</span>}
            {title}
          </div>
          {right}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** Hover popover. Content stays open while the pointer is over it, so links are clickable. */
export function HoverCard({
  trigger,
  children,
  align = 'left',
  width = 'w-80',
}: {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}) {
  const pos = align === 'right' ? 'right-0' : align === 'center' ? 'left-1/2 -translate-x-1/2' : 'left-0';
  return (
    <span className="group relative inline-flex">
      {trigger}
      <span className={`invisible absolute top-full z-50 pt-2 opacity-0 transition group-hover:visible group-hover:opacity-100 ${pos}`}>
        <span className={`block ${width} rounded-lg border border-line bg-[#0E1729] p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-300 shadow-2xl shadow-black/50`}>
          {children}
        </span>
      </span>
    </span>
  );
}

export function InfoTip({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' | 'center' }) {
  return (
    <HoverCard align={align} trigger={<Info size={13} className="cursor-help text-slate-500 hover:text-slate-300" />}>
      {children}
    </HoverCard>
  );
}

export function RefLink({ label, url }: { label: string; url: string }) {
  if (!url) return <span className="text-slate-400">{label}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1 text-accent hover:underline">
      <span>{label}</span>
      <ExternalLink size={11} className="mt-0.5 shrink-0" />
    </a>
  );
}

const SOURCE_STYLE: Record<DataSourceType, { dot: string; cls: string }> = {
  published_benchmark: { dot: 'bg-emerald', cls: 'border-emerald/40 bg-emerald/10 text-emerald' },
  interpolated: { dot: 'bg-accent', cls: 'border-accent/40 bg-accent/10 text-accent' },
  assumption: { dot: 'bg-warn', cls: 'border-warn/40 bg-warn/10 text-warn' },
  unavailable: { dot: 'bg-slate-500', cls: 'border-slate-500/40 bg-slate-500/10 text-slate-400' },
};

export function SourceBadge({
  type,
  citation,
  url,
  compact = false,
  align = 'left',
}: {
  type: DataSourceType;
  citation?: string;
  url?: string;
  compact?: boolean;
  align?: 'left' | 'right' | 'center';
}) {
  const s = SOURCE_STYLE[type];
  const info = SOURCE_TYPE_INFO[type];
  return (
    <HoverCard
      align={align}
      trigger={
        <span className={`inline-flex cursor-help items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {compact ? info.label.split(' ')[0] : info.label}
        </span>
      }
    >
      <span className="mb-1 flex items-center gap-1.5 font-semibold text-slate-100">
        <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {info.label}
      </span>
      <span className="block text-slate-400">{info.description}</span>
      {citation && (
        <span className="mt-2 block border-t border-line pt-2">
          <RefLink label={citation} url={url ?? ''} />
        </span>
      )}
      {!citation && info.refs.length > 0 && (
        <span className="mt-2 block space-y-1 border-t border-line pt-2">
          {info.refs.map((r) => (
            <span key={r.url} className="block">
              <RefLink label={r.label} url={r.url} />
            </span>
          ))}
        </span>
      )}
    </HoverCard>
  );
}

export function Slider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  hint,
  accent,
  disabled,
}: {
  label: ReactNode;
  value: number;
  display: ReactNode;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  hint?: ReactNode;
  accent?: string;
  disabled?: boolean;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className={`block ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-slate-300">{label}</span>
        <span className="font-mono font-semibold text-slate-50">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2"
        style={{
          background: `linear-gradient(to right, ${accent ?? COLORS.accent} 0%, ${accent ?? COLORS.accent} ${pct}%, ${COLORS.line} ${pct}%, ${COLORS.line} 100%)`,
          borderRadius: 9999,
          height: 6,
        }}
      />
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex w-full items-center justify-between gap-3 text-left text-xs text-slate-200">
      <span className="flex items-center gap-1.5">{label}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${checked ? 'bg-emerald' : 'bg-line'}`}>
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid rounded-lg border border-line bg-bg p-0.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition ${
            value === o.value ? 'bg-panel text-slate-50 shadow ring-1 ring-line' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const tooltipStyle = {
  contentStyle: {
    background: '#0E1729',
    border: `1px solid ${COLORS.line}`,
    borderRadius: 8,
    fontSize: 12,
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
  },
  labelStyle: { color: '#e2e8f0', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: '#cbd5e1', padding: 0 },
};
