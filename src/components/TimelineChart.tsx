import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { SimulationConfig, SimulationResult } from '../types/simulator';
import type { TimelineResult } from '../engine/TimelineSimulator';
import { GPU_ACTUATION_LATENCY_S, WORKLOAD_UI } from '../data/publicProfiles';
import { COLORS, InfoTip, fmtKw, tooltipStyle } from './ui';

interface Props {
  cfg: SimulationConfig;
  sim: SimulationResult;
  tl: TimelineResult;
}

function Stat({ label, value, tone = 'text-slate-100', tip }: { label: string; value: string; tone?: string; tip?: string }) {
  return (
    <div className="rounded-lg border border-line bg-bg/50 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-slate-500">
        {label}
        {tip && <InfoTip>{tip}</InfoTip>}
      </div>
      <div className={`font-mono text-base font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

export default function TimelineChart({ cfg, sim, tl }: Props) {
  const kw = (v: number) => `${v.toFixed(1)} kW`;
  const yMin = Math.max(0, Math.floor((sim.target_power_kw - sim.required_reduction_kw * 0.6) / 10) * 10);
  const yMax = Math.ceil((sim.baseline_kw + sim.required_reduction_kw * 0.15) / 10) * 10;
  const stagger = sim.aware.node_results.filter((n) => n.actual_power_saved_kw > 0.01).sort((a, b) => b.actual_power_saved_kw - a.actual_power_saved_kw);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat label="Event cap" value={kw(sim.target_power_kw)} tone="text-red-300" />
        <Stat
          label="Time to compliance"
          value={tl.time_to_compliance_s === null ? 'Not met' : `${tl.time_to_compliance_s.toFixed(2)} s`}
          tone={tl.time_to_compliance_s === null ? 'text-danger' : 'text-emerald'}
          tip="Seconds after the 4CP warning until grid draw ≤ cap and stays there. BESS bridges the GPU ramp after its response delay."
        />
        <Stat label="GPU ramp duration" value={`${tl.ramp_duration_s.toFixed(1)} s`} tip={`Includes ${GPU_ACTUATION_LATENCY_S.toFixed(1)} s actuation latency (model assumption) + shed ÷ ramp-rate limit.`} />
        <Stat label="BESS peak / energy" value={`${tl.bess_peak_kw.toFixed(1)} kW · ${tl.bess_energy_kwh.toFixed(2)} kWh`} tone="text-emerald" />
        <Stat label="Event compliance" value={`${tl.compliance_pct.toFixed(2)}%`} tone={tl.compliance_pct > 99 ? 'text-emerald' : 'text-warn'} tip="Share of the 30-min event (100 ms resolution) with grid draw at or below the cap." />
      </div>

      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-200">60-min Co-Simulation · 1-min resolution · 4CP warning T+15 → T+45</div>
          <div className="text-[11px] text-slate-500">minute averages of a 100 ms internal simulation</div>
        </div>
        <div className="h-80">
          <ResponsiveContainer>
            <ComposedChart data={tl.minutes} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="gBess" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.emerald} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={COLORS.emerald} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="minute" type="number" domain={[0, 59]} ticks={[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]} tickFormatter={(m) => `T+${m}`} tickLine={false} />
              <YAxis yAxisId="p" unit=" kW" domain={[yMin, yMax]} tickLine={false} axisLine={false} width={68} />
              <YAxis yAxisId="b" orientation="right" unit=" kW" tickLine={false} axisLine={false} width={56} domain={[0, (d: number) => Math.max(10, Math.ceil(d * 1.6))]} />
              <Tooltip {...tooltipStyle} labelFormatter={(m) => `T+${m} min`} formatter={(v: number) => (typeof v === 'number' ? kw(v) : '—')} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceArea yAxisId="p" x1={15} x2={45} fill={COLORS.accent} fillOpacity={0.06} label={{ value: 'ERCOT 4CP peak warning', position: 'insideTopLeft', fill: '#93C5FD', fontSize: 11 }} />
              <ReferenceLine yAxisId="p" x={15} stroke={COLORS.accent} strokeDasharray="4 3" />
              <ReferenceLine yAxisId="p" x={45} stroke={COLORS.accent} strokeDasharray="4 3" />
              <Area yAxisId="b" type="stepAfter" dataKey="bess_kw" name="BESS discharge (right axis)" stroke={COLORS.emerald} fill="url(#gBess)" strokeWidth={1.5} isAnimationActive={false} />
              <Line yAxisId="p" type="stepAfter" dataKey="baseline_kw" name="Baseline IT load" stroke={COLORS.slate} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
              <Line yAxisId="p" type="stepAfter" dataKey="uniform_kw" name="Uniform capping (no BESS)" stroke={COLORS.uniform} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" type="stepAfter" dataKey="gpu_aware_kw" name="Workload-aware GPU load" stroke="#60A5FA" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" type="stepAfter" dataKey="grid_aware_kw" name="Grid draw (aware + BESS)" stroke={COLORS.aware} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line yAxisId="p" type="stepAfter" dataKey="target_kw" name="Event power cap" stroke={COLORS.danger} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-line bg-bg/40 p-3">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold text-slate-200">Event Onset Zoom · staggered actuation & BESS bridge (seconds after T+15)</div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <span>Ramp limit {cfg.ramp_rate_kw_per_s} kW/s</span>
            <span>BESS delay {cfg.bess_enabled ? `${cfg.bess_response_delay_ms} ms` : 'offline'}</span>
            <span>Stagger: {stagger.map((n) => WORKLOAD_UI[n.workload_id].short).join(' → ') || '—'}</span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <ComposedChart data={tl.onset} margin={{ top: 10, right: 12, left: -4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} unit=" s" tickLine={false} />
              <YAxis unit=" kW" tickLine={false} axisLine={false} width={68} domain={[0, Math.ceil(sim.baseline_kw * 1.05)]} />
              <Tooltip {...tooltipStyle} labelFormatter={(t) => `t = ${t} s`} formatter={(v: number) => kw(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {sim.aware.node_results.map((n) => (
                <Area
                  key={n.workload_id}
                  type="linear"
                  dataKey={n.workload_id}
                  name={`${WORKLOAD_UI[n.workload_id].short} GPU load`}
                  stackId="gpu"
                  stroke={WORKLOAD_UI[n.workload_id].color}
                  fill={WORKLOAD_UI[n.workload_id].color}
                  fillOpacity={0.18}
                  strokeWidth={1}
                  isAnimationActive={false}
                />
              ))}
              <ReferenceLine x={0} stroke={COLORS.accent} strokeDasharray="4 3" label={{ value: '4CP warning', fill: '#93C5FD', fontSize: 10, position: 'insideTopRight' }} />
              {cfg.bess_enabled && (
                <ReferenceLine x={cfg.bess_response_delay_ms / 1000} stroke={COLORS.emerald} strokeDasharray="2 3" label={{ value: 'BESS online', fill: COLORS.emerald, fontSize: 10, position: 'insideBottomRight' }} />
              )}
              <Line type="linear" dataKey="grid_aware_kw" name="Grid draw (aware + BESS)" stroke={COLORS.aware} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="bess_kw" name="BESS discharge" stroke="#6EE7B7" strokeWidth={1.5} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
              <Line type="stepAfter" dataKey="target_kw" name="Cap" stroke={COLORS.danger} strokeWidth={2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          GPU groups are actuated sequentially (largest shed first) within the facility ramp limit. Post-event recovery at T+45 ramps back at
          the same limit to avoid a rebound spike. Total shed {fmtKw(sim.aware.achieved_reduction_kw)}.
        </p>
      </div>
    </div>
  );
}
