import { useMemo } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationResult } from '../types/simulator';
import { WORKLOAD_PROFILES, WORKLOAD_UI, getGpu } from '../data/publicProfiles';
import { estimatePower, platformScale } from '../engine/PowerEstimator';
import { COLORS, SourceBadge, tooltipStyle } from './ui';

interface Props {
  sim: SimulationResult;
  gpuId: string;
}

type DotProps = { cx?: number; cy?: number };

const AwareMarker = (color: string) => (p: DotProps) => (
  <g>
    <circle cx={p.cx} cy={p.cy} r={9} fill={COLORS.aware} fillOpacity={0.18} />
    <circle cx={p.cx} cy={p.cy} r={5.5} fill={color} stroke={COLORS.aware} strokeWidth={2.5} />
  </g>
);
const UniformMarker = (color: string) => (p: DotProps) => {
  const x = p.cx ?? 0;
  const y = p.cy ?? 0;
  const s = 7;
  return (
    <polygon
      points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`}
      fill={COLORS.bg}
      stroke={COLORS.uniform}
      strokeWidth={2.5}
      style={{ filter: `drop-shadow(0 0 3px ${color})` }}
    />
  );
};

export default function ParetoChart({ sim, gpuId }: Props) {
  const gpu = getGpu(gpuId);
  const scale = platformScale(gpu);
  const { min_limit_w, max_limit_w } = gpu.power_capability;

  const data = useMemo(() => {
    const out: Record<string, number>[] = [];
    for (let l = min_limit_w; l <= max_limit_w; l += 10) {
      const row: Record<string, number> = { limit: l, nominal: l };
      for (const w of WORKLOAD_PROFILES) {
        const e = estimatePower(gpu, w, l);
        row[`${w.id}_w`] = e.estimated_actual_power_w;
        row[`${w.id}_t`] = e.relative_throughput_pct;
      }
      out.push(row);
    }
    return out;
  }, [gpu, min_limit_w, max_limit_w]);

  const points = sim.aware.node_results.map((a, i) => {
    const u = sim.uniform.node_results[i];
    const wl = WORKLOAD_PROFILES.find((w) => w.id === a.workload_id)!;
    const ae = estimatePower(gpu, wl, a.assigned_power_limit_w);
    const ue = estimatePower(gpu, wl, u.assigned_power_limit_w);
    return { id: a.workload_id, color: WORKLOAD_UI[a.workload_id].color, active: a.gpu_count > 0, ae, ue, wl };
  });

  const illusion = { x1: 300 * scale, x2: 700 * scale };
  const xAxisProps = {
    dataKey: 'limit',
    type: 'number' as const,
    domain: [min_limit_w, max_limit_w] as [number, number],
    tickCount: 9,
    unit: ' W',
    tickLine: false,
    axisLine: { stroke: COLORS.line },
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <div className="mb-1 text-xs font-semibold text-slate-200">Power Limit (W) → Actual Power Draw (W)</div>
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 12, left: -4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis {...xAxisProps} />
                <YAxis unit=" W" tickLine={false} axisLine={false} width={56} domain={[0, Math.ceil(max_limit_w / 100) * 100]} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => `Power limit ${l} W`} formatter={(v: number) => `${v.toFixed(0)} W`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceArea
                  x1={illusion.x1}
                  x2={illusion.x2}
                  fill={COLORS.danger}
                  fillOpacity={0.07}
                  label={{ value: 'Decode Power Cap Illusion: 0 W saved', position: 'insideTop', fill: '#FCA5A5', fontSize: 11 }}
                />
                <Line dataKey="nominal" name="Limit (y = x)" stroke="#475569" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                {WORKLOAD_PROFILES.map((w) => (
                  <Line key={w.id} dataKey={`${w.id}_w`} name={WORKLOAD_UI[w.id].short} stroke={WORKLOAD_UI[w.id].color} strokeWidth={2.25} dot={false} isAnimationActive={false} />
                ))}
                {points.filter((p) => p.active).map((p) => (
                  <ReferenceDot key={`u-${p.id}`} x={p.ue.power_limit_w} y={p.ue.estimated_actual_power_w} shape={UniformMarker(p.color)} ifOverflow="extendDomain" />
                ))}
                {points.filter((p) => p.active).map((p) => (
                  <ReferenceDot key={`a-${p.id}`} x={p.ae.power_limit_w} y={p.ae.estimated_actual_power_w} shape={AwareMarker(p.color)} ifOverflow="extendDomain" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-lg border border-line bg-bg/40 p-3">
          <div className="mb-1 text-xs font-semibold text-slate-200">Power Limit (W) → Relative Throughput (%)</div>
          <div className="h-80">
            <ResponsiveContainer>
              <LineChart data={data} margin={{ top: 10, right: 12, left: -4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis {...xAxisProps} />
                <YAxis unit="%" tickLine={false} axisLine={false} width={48} domain={[20, 100]} />
                <Tooltip {...tooltipStyle} labelFormatter={(l) => `Power limit ${l} W`} formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {WORKLOAD_PROFILES.map((w) => (
                  <Line key={w.id} dataKey={`${w.id}_t`} name={WORKLOAD_UI[w.id].short} stroke={WORKLOAD_UI[w.id].color} strokeWidth={2.25} dot={false} isAnimationActive={false} />
                ))}
                {points.filter((p) => p.active).map((p) => (
                  <ReferenceDot key={`u-${p.id}`} x={p.ue.power_limit_w} y={p.ue.relative_throughput_pct} shape={UniformMarker(p.color)} ifOverflow="extendDomain" />
                ))}
                {points.filter((p) => p.active).map((p) => (
                  <ReferenceDot key={`a-${p.id}`} x={p.ae.power_limit_w} y={p.ae.relative_throughput_pct} shape={AwareMarker(p.color)} ifOverflow="extendDomain" />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16"><circle cx="8" cy="8" r="5" fill="#94a3b8" stroke={COLORS.aware} strokeWidth="2.5" /></svg>
          Workload-Aware operating point
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16"><polygon points="8,1 15,8 8,15 1,8" fill={COLORS.bg} stroke={COLORS.uniform} strokeWidth="2.5" /></svg>
          Uniform Capping operating point (fleet-wide {sim.uniform_cap_w} W)
        </span>
        {scale !== 1 && <span className="text-warn">Curves scaled from H100 700 W base → all points Model Assumption</span>}
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-bg/60">
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-medium">Workload</th>
              <th className="px-3 py-2 text-right font-medium">Uniform limit → actual</th>
              <th className="px-3 py-2 text-right font-medium">Aware limit → actual</th>
              <th className="px-3 py-2 text-right font-medium">Headroom wasted (uniform)</th>
              <th className="px-3 py-2 font-medium">Profile source</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id} className="border-t border-line/70">
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2 text-slate-200">
                    <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />
                    {WORKLOAD_UI[p.id].short}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {p.ue.power_limit_w} W → <span className="text-uniform text-warn">{p.ue.estimated_actual_power_w.toFixed(0)} W</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-300">
                  {p.ae.power_limit_w} W → <span className="text-emerald">{p.ae.estimated_actual_power_w.toFixed(0)} W</span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-slate-400">{(p.ue.power_limit_w - p.ue.estimated_actual_power_w).toFixed(0)} W</td>
                <td className="px-3 py-2">
                  <SourceBadge type={p.wl.source_type} citation={p.wl.source_citation} url={p.wl.source_url} align="right" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
