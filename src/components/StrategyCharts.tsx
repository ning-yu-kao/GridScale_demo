import type { ReactNode } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ClusterWorkloadGroup, SimulationResult } from '../types/simulator';
import { WORKLOAD_UI } from '../data/publicProfiles';
import { COLORS, tooltipStyle } from './ui';

function Mini({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-bg/40 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-xs font-semibold text-slate-200">{title}</div>
        {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
      </div>
      <div className="h-56">{children}</div>
    </div>
  );
}

const axis = { tickLine: false, axisLine: { stroke: COLORS.line } } as const;

export default function StrategyCharts({ sim, groups }: { sim: SimulationResult; groups: ClusterWorkloadGroup[] }) {
  const rows = sim.aware.node_results.map((a, i) => {
    const u = sim.uniform.node_results[i];
    return {
      name: WORKLOAD_UI[a.workload_id].short,
      color: WORKLOAD_UI[a.workload_id].color,
      sla: groups[i].max_allowed_perf_loss_pct,
      uDraw: u.predicted_actual_power_kw,
      aDraw: a.predicted_actual_power_kw,
      base: a.baseline_actual_power_kw,
      uSaved: u.actual_power_saved_kw,
      aSaved: a.actual_power_saved_kw,
      uLoss: u.predicted_perf_loss_pct,
      aLoss: a.predicted_perf_loss_pct,
      uViol: u.sla_violated,
      uLimit: u.assigned_power_limit_w,
      aLimit: a.assigned_power_limit_w,
    };
  });

  const unmetRows = [
    {
      name: 'Uniform',
      gpu: Math.min(sim.uniform.achieved_reduction_kw, sim.required_reduction_kw),
      bess: 0,
      unmet: sim.uniform.unmet_power_reduction_kw,
    },
    {
      name: 'Workload-Aware',
      gpu: Math.min(sim.aware.achieved_reduction_kw, sim.required_reduction_kw),
      bess: sim.bess.dispatched_kw,
      unmet: sim.bess.residual_unmet_kw,
    },
  ];

  const kw = (v: number) => `${v.toFixed(1)} kW`;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Mini title="Actual Power Draw (kW)" sub="after curtailment">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis tickLine={false} axisLine={false} width={48} />
            <Tooltip {...tooltipStyle} formatter={kw} cursor={{ fill: '#ffffff08' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="base" name="Baseline" fill="#334155" radius={[3, 3, 0, 0]} />
            <Bar dataKey="uDraw" name="Uniform" fill={COLORS.uniform} radius={[3, 3, 0, 0]} />
            <Bar dataKey="aDraw" name="Workload-Aware" fill={COLORS.aware} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Mini>

      <Mini title="Actual Power Saved (kW)" sub="nominal caps on decode save 0 W">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis tickLine={false} axisLine={false} width={48} />
            <Tooltip
              {...tooltipStyle}
              cursor={{ fill: '#ffffff08' }}
              formatter={(v: number, n: string, p: { payload?: (typeof rows)[number] }) => [
                `${v.toFixed(1)} kW @ ${n === 'Uniform' ? p.payload?.uLimit : p.payload?.aLimit} W limit`,
                n,
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="uSaved" name="Uniform" fill={COLORS.uniform} radius={[3, 3, 0, 0]} />
            <Bar dataKey="aSaved" name="Workload-Aware" fill={COLORS.aware} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Mini>

      <Mini title="Throughput Loss (%)" sub="grey = SLA ceiling · red = breach">
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 6, right: 8, left: -8, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" {...axis} />
            <YAxis tickLine={false} axisLine={false} width={48} unit="%" />
            <Tooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} cursor={{ fill: '#ffffff08' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="sla" name="SLA ceiling" fill="#334155" radius={[3, 3, 0, 0]} />
            <Bar dataKey="uLoss" name="Uniform" fill={COLORS.uniform} radius={[3, 3, 0, 0]}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.uViol ? COLORS.danger : COLORS.uniform} />
              ))}
            </Bar>
            <Bar dataKey="aLoss" name="Workload-Aware" fill={COLORS.aware} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Mini>

      <Mini title="Grid Target Coverage (kW)" sub={`target ${kw(sim.required_reduction_kw)}`}>
        <ResponsiveContainer>
          <BarChart data={unmetRows} layout="vertical" margin={{ top: 6, right: 16, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickLine={false} axisLine={false} />
            <YAxis type="category" dataKey="name" width={100} tickLine={false} axisLine={false} />
            <Tooltip {...tooltipStyle} formatter={kw} cursor={{ fill: '#ffffff08' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={sim.required_reduction_kw} stroke={COLORS.accent} strokeDasharray="5 4" />
            <Bar dataKey="gpu" name="GPU shed" stackId="s" fill={COLORS.accent} />
            <Bar dataKey="bess" name="BESS dispatch" stackId="s" fill={COLORS.emerald} />
            <Bar dataKey="unmet" name="Unmet demand" stackId="s" fill={COLORS.danger} fillOpacity={0.35} stroke={COLORS.danger} strokeDasharray="3 3" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Mini>
    </div>
  );
}
