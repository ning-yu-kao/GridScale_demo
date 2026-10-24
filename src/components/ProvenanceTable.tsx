import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react';
import type { ClusterWorkloadGroup, SimulationResult } from '../types/simulator';
import { WORKLOAD_UI, getWorkload } from '../data/publicProfiles';
import { COLORS, SourceBadge, fmtKw, fmtPct } from './ui';

export default function ProvenanceTable({ sim, groups }: { sim: SimulationResult; groups: ClusterWorkloadGroup[] }) {
  const rows = [sim.uniform, sim.aware].flatMap((s) =>
    s.node_results.map((n, i) => ({ s: s.strategy_name, n, sla: groups[i].max_allowed_perf_loss_pct })),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
        <SourceBadge type="published_benchmark" />
        <span>Dell XE9680 / arXiv:2605.11999 / NVIDIA Redfish Docs</span>
        <span className="text-line">|</span>
        <SourceBadge type="interpolated" />
        <span>Piecewise linear between benchmark points</span>
        <span className="text-line">|</span>
        <SourceBadge type="assumption" />
        <span>Explicitly flagged synthetic curve</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[960px] text-xs">
          <thead className="bg-bg/60">
            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2 font-medium">Strategy</th>
              <th className="px-3 py-2 font-medium">Workload</th>
              <th className="px-3 py-2 text-right font-medium">GPUs</th>
              <th className="px-3 py-2 text-right font-medium">Power limit</th>
              <th className="px-3 py-2 text-right font-medium">Baseline</th>
              <th className="px-3 py-2 text-right font-medium">Predicted</th>
              <th className="px-3 py-2 text-right font-medium">Saved</th>
              <th className="px-3 py-2 text-right font-medium">Perf loss / SLA</th>
              <th className="px-3 py-2 text-center font-medium">SLA</th>
              <th className="px-3 py-2 font-medium">Source type</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, n, sla }) => {
              const wl = getWorkload(n.workload_id);
              const isUni = s === 'Uniform Power Capping';
              const illusion = n.baseline_power_limit_w - n.assigned_power_limit_w > 0 && n.actual_power_saved_kw < 0.01 && n.gpu_count > 0;
              return (
                <tr key={`${s}-${n.workload_id}`} className="border-t border-line/70 hover:bg-white/[0.02]">
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: isUni ? COLORS.uniform : COLORS.aware }}>
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: isUni ? COLORS.uniform : COLORS.aware }} />
                      {isUni ? 'Uniform' : 'Workload-Aware'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2 text-slate-200">
                      <span className="h-2 w-2 rounded-sm" style={{ background: WORKLOAD_UI[n.workload_id].color }} />
                      {n.workload_name}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{n.gpu_count.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className="text-slate-500">{n.baseline_power_limit_w}→</span>
                    <span className="text-slate-100">{n.assigned_power_limit_w} W</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{fmtKw(n.baseline_actual_power_kw)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-200">{fmtKw(n.predicted_actual_power_kw)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    <span className="text-accent">{fmtKw(n.actual_power_saved_kw)}</span>
                    {illusion && (
                      <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-danger/15 px-1 py-px text-[10px] font-semibold text-red-300" title="Power limit lowered, but actual draw unchanged">
                        <ShieldAlert size={10} /> illusion
                      </span>
                    )}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${n.sla_violated ? 'text-danger' : 'text-slate-200'}`}>
                    {fmtPct(n.predicted_perf_loss_pct)} <span className="text-slate-500">/ {sla}%</span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {n.sla_violated ? <XCircle size={14} className="inline text-danger" /> : <CheckCircle2 size={14} className="inline text-emerald" />}
                  </td>
                  <td className="px-3 py-2">
                    <SourceBadge type={n.source_type} citation={wl.source_citation} url={wl.source_url} align="right" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
