import { BatteryCharging, DollarSign, Gauge, TrendingDown } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SimulationResult } from '../types/simulator';
import { ERCOT_4CP_USD_PER_MW_YEAR } from '../data/publicProfiles';
import { COLORS, InfoTip, fmtKw, fmtPct, fmtUsd } from './ui';

function Card({ title, icon, tip, children }: { title: string; icon: ReactNode; tip?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <span className="text-slate-500">{icon}</span>
          {title}
        </div>
        {tip && <InfoTip align="right">{tip}</InfoTip>}
      </div>
      {children}
    </div>
  );
}

function Bar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

function Row({ label, color, value, sub }: { label: string; color: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-slate-400">
        <span className="h-2 w-2 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className="text-right">
        <span className="font-mono text-sm font-semibold text-slate-100">{value}</span>
        {sub && <span className="ml-1.5 font-mono text-[11px] text-slate-500">{sub}</span>}
      </span>
    </div>
  );
}

export default function KpiCards({ sim }: { sim: SimulationResult }) {
  const { uniform, aware, bess, required_reduction_kw: req } = sim;
  const pctOf = (kw: number) => (req > 0 ? (kw / req) * 100 : 100);
  const uPct = pctOf(uniform.achieved_reduction_kw);
  const aPct = pctOf(aware.achieved_reduction_kw);

  const uLoss = uniform.weighted_avg_perf_loss_pct;
  const aLoss = aware.weighted_avg_perf_loss_pct;
  const per100 = (loss: number, kw: number) => (kw > 1e-6 ? (loss / kw) * 100 : 0);
  const uEff = per100(uLoss, uniform.achieved_reduction_kw);
  const aEff = per100(aLoss, aware.achieved_reduction_kw);
  const effDelta = uEff > 1e-9 ? ((aEff - uEff) / uEff) * 100 : 0;

  const awareTotalMw = (aware.achieved_reduction_kw + bess.dispatched_kw) / 1000;
  const uniformMw = uniform.achieved_reduction_kw / 1000;
  const awareUsd = awareTotalMw * ERCOT_4CP_USD_PER_MW_YEAR;
  const uniformUsd = uniformMw * ERCOT_4CP_USD_PER_MW_YEAR;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
      {/* 1 — Actual shed */}
      <Card
        title="Actual Power Shed Achieved"
        icon={<TrendingDown size={14} />}
        tip="Actual (not nominal) watts removed, computed from each workload's power curve. Decode GPUs draw ~260 W regardless of a 300–700 W limit, so nominal caps there remove 0 W."
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold text-emerald">{fmtKw(aware.achieved_reduction_kw)}</span>
          <span className="font-mono text-sm text-slate-400">/ {fmtKw(req)} target</span>
        </div>
        <div className="mt-3 space-y-2.5">
          <div>
            <Row label="Workload-Aware" color={COLORS.aware} value={fmtPct(aPct, 0)} sub="of target" />
            <div className="mt-1"><Bar pct={aPct} color={COLORS.aware} /></div>
          </div>
          <div>
            <Row label="Uniform Capping" color={COLORS.uniform} value={fmtKw(uniform.achieved_reduction_kw)} sub={fmtPct(uPct, 0)} />
            <div className="mt-1"><Bar pct={uPct} color={uPct < 99.5 ? COLORS.danger : COLORS.uniform} /></div>
          </div>
        </div>
        {uPct < 99.5 && (
          <p className="mt-3 rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-red-300">
            Uniform falls short by {fmtKw(uniform.unmet_power_reduction_kw)} — the Decode Power Cap Illusion.
          </p>
        )}
      </Card>

      {/* 2 — SLA / throughput */}
      <Card
        title="Weighted SLA / Throughput Impact"
        icon={<Gauge size={14} />}
        tip="Throughput loss averaged over GPUs × priority weight (Decode 10, Offline 5, Training 3). 'Per 100 kW' normalizes by actual shed so strategies achieving different shed are comparable."
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold text-slate-50">{fmtPct(aLoss, 2)}</span>
          <span className="text-sm text-slate-400">workload-aware</span>
        </div>
        <div className="mt-3 space-y-1.5">
          <Row label="Uniform loss" color={COLORS.uniform} value={fmtPct(uLoss, 2)} />
          <Row label="Loss / 100 kW shed" color={COLORS.aware} value={aEff.toFixed(2)} sub={`vs ${uEff.toFixed(2)}`} />
          <Row
            label="SLA breaches"
            color={uniform.sla_violations_count > 0 ? COLORS.danger : COLORS.slate}
            value={
              <span>
                <span className="text-emerald">{aware.sla_violations_count}</span>
                <span className="text-slate-500"> vs </span>
                <span className={uniform.sla_violations_count > 0 ? 'text-danger' : 'text-slate-300'}>{uniform.sla_violations_count}</span>
              </span>
            }
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {uEff > 1e-9 && (
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${effDelta <= 0 ? 'bg-emerald/15 text-emerald' : 'bg-warn/15 text-warn'}`}>
              {effDelta <= 0 ? '−' : '+'}
              {Math.abs(effDelta).toFixed(0)}% loss per kW shed
            </span>
          )}
          {aware.sla_violations_count === 0 && <span className="rounded-md bg-emerald/15 px-2 py-0.5 text-[11px] font-semibold text-emerald">0 SLA breaches</span>}
        </div>
      </Card>

      {/* 3 — Unmet & BESS */}
      <Card
        title="Unmet Grid Demand & BESS Dispatch"
        icon={<BatteryCharging size={14} />}
        tip="When the target exceeds the SLA-safe GPU flexibility envelope, the remainder is reported as Unmet GPU Reduction and routed to the simulated BESS (bess_required_kw = unmet_power_reduction_kw)."
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-warn/30 bg-warn/10 p-2.5">
            <div className="text-[11px] font-medium uppercase tracking-wider text-warn/80">Unmet GPU Reduction</div>
            <div className="font-mono text-2xl font-semibold text-warn">{fmtKw(aware.unmet_power_reduction_kw)}</div>
          </div>
          <div className={`rounded-lg border p-2.5 ${bess.enabled ? 'border-emerald/30 bg-emerald/10' : 'border-line bg-bg'}`}>
            <div className={`text-[11px] font-medium uppercase tracking-wider ${bess.enabled ? 'text-emerald/80' : 'text-slate-500'}`}>
              {bess.enabled ? (bess.dispatched_kw > 0 ? 'BESS Discharge Activated' : 'BESS Armed · Standby') : 'BESS Offline'}
            </div>
            <div className={`font-mono text-2xl font-semibold ${bess.enabled ? 'text-emerald' : 'text-slate-500'}`}>{fmtKw(bess.dispatched_kw)}</div>
          </div>
          {bess.residual_unmet_kw > 0.05 && (
            <div className="rounded-md border border-danger/30 bg-danger/10 px-2 py-1 text-[11px] text-red-300">
              Residual uncovered: <span className="font-mono font-semibold">{fmtKw(bess.residual_unmet_kw)}</span>
            </div>
          )}
        </div>
      </Card>

      {/* 4 — Avoided penalty */}
      <Card
        title="Est. ERCOT 4CP Avoided Penalty"
        icon={<DollarSign size={14} />}
        tip={
          <>
            <b>Illustrative estimate based on $65,000/MW-year ERCOT transmission 4CP tariff assumption.</b>
            <br />
            Avoided MW = sustained GPU shed (+ BESS dispatch for workload-aware) during the 4CP interval.
          </>
        }
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-3xl font-semibold text-emerald">{fmtUsd(awareUsd)}</span>
          <span className="text-sm text-slate-400">/ yr</span>
        </div>
        <div className="mt-3 space-y-1.5">
          <Row label="Workload-Aware + BESS" color={COLORS.aware} value={fmtUsd(awareUsd)} sub={`${(awareTotalMw * 1000).toFixed(1)} kW`} />
          <Row label="Uniform Capping" color={COLORS.uniform} value={fmtUsd(uniformUsd)} sub={`${(uniformMw * 1000).toFixed(1)} kW`} />
        </div>
        <div className="mt-3 rounded-md bg-emerald/10 px-2 py-1 text-[11px] font-semibold text-emerald">
          +{fmtUsd(Math.max(0, awareUsd - uniformUsd))}/yr vs uniform
        </div>
        <p className="mt-2 text-[10px] leading-snug text-slate-500">Illustrative · $65,000/MW-yr 4CP tariff assumption</p>
      </Card>
    </div>
  );
}
