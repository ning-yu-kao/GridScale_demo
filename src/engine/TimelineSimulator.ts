import type { SimulationConfig, SimulationResult } from '../types/simulator';
import { GPU_ACTUATION_LATENCY_S } from '../data/publicProfiles';

export const TIMELINE_MINUTES = 60;
export const EVENT_START_S = 15 * 60;
export const EVENT_END_S = 45 * 60;
const DT = 0.1; // internal resolution (s)

export interface MinutePoint {
  minute: number;
  label: string;
  inEvent: boolean;
  baseline_kw: number;
  target_kw: number | null;
  gpu_aware_kw: number;
  grid_aware_kw: number; // GPU load − BESS discharge
  bess_kw: number;
  uniform_kw: number;
}

export interface OnsetPoint {
  t: number; // seconds after the 4CP warning
  target_kw: number;
  gpu_aware_kw: number;
  grid_aware_kw: number;
  bess_kw: number;
  [groupId: string]: number;
}

export interface TimelineResult {
  minutes: MinutePoint[];
  onset: OnsetPoint[];
  ramp_duration_s: number;
  bess_energy_kwh: number;
  bess_peak_kw: number;
  time_to_compliance_s: number | null; // null → target never fully met
  compliance_pct: number; // share of event time with grid draw ≤ target
}

/**
 * Deterministic 60-min co-simulation of an ERCOT 4CP peak warning (T=15 → T=45 min).
 *  - GPU power-limit changes are staggered group-by-group, total ramp limited by `ramp_rate_kw_per_s`,
 *    starting after a fixed actuation latency (model assumption).
 *  - BESS starts absorbing the gap (GPU load − target) after `bess_response_delay_ms`, capped at max discharge.
 *  - At T=45 the target is lifted; GPUs ramp back up at the same ramp limit (no rebound spike).
 */
export function simulateTimeline(cfg: SimulationConfig, sim: SimulationResult): TimelineResult {
  const B = sim.baseline_kw;
  const target = sim.target_power_kw;
  const R = Math.max(0.1, cfg.ramp_rate_kw_per_s);
  const bessMax = cfg.bess_enabled ? cfg.bess_max_discharge_mw * 1000 : 0;
  const bessDelay = cfg.bess_response_delay_ms / 1000;

  // Staggered actuation order: groups that shed the most go first.
  const awareShed = sim.aware.node_results
    .map((n) => ({ id: n.workload_id, kw: Math.max(0, n.actual_power_saved_kw), base: n.baseline_actual_power_kw }))
    .sort((a, b) => b.kw - a.kw);
  const awareTotal = awareShed.reduce((s, g) => s + g.kw, 0);
  const uniformTotal = Math.max(0, sim.uniform.achieved_reduction_kw);

  const shedAt = (total: number, tau: number) => {
    // tau: seconds since actuation started (negative → none); ramp-down limited by R.
    if (tau <= 0) return 0;
    return Math.min(total, R * tau);
  };
  const loadAt = (total: number, t: number) => {
    const tOn = EVENT_START_S + GPU_ACTUATION_LATENCY_S;
    const tOff = EVENT_END_S;
    if (t < tOn) return B;
    const shedOn = shedAt(total, t - tOn);
    if (t < tOff) return B - shedOn;
    const shedAtOff = shedAt(total, tOff - tOn);
    return B - Math.max(0, shedAtOff - R * (t - tOff));
  };
  const groupShedAt = (t: number) => {
    // Per-group GPU load for the staggered stacked view (groups shed sequentially).
    let acc = B - loadAt(awareTotal, t);
    const out: Record<string, number> = {};
    for (const g of awareShed) {
      const s = Math.min(g.kw, acc);
      out[g.id] = g.base - s;
      acc -= s;
    }
    return out;
  };
  const bessAt = (gpuKw: number, t: number) => {
    if (bessMax <= 0) return 0;
    if (t < EVENT_START_S + bessDelay || t >= EVENT_END_S) return 0;
    return Math.min(bessMax, Math.max(0, gpuKw - target));
  };

  const minutes: MinutePoint[] = [];
  let energyKwh = 0;
  let bessPeak = 0;
  let compliant = 0;
  let eventSamples = 0;
  const stepsPerMin = Math.round(60 / DT);

  for (let m = 0; m < TIMELINE_MINUTES; m++) {
    let gSum = 0;
    let bSum = 0;
    let uSum = 0;
    for (let k = 0; k < stepsPerMin; k++) {
      const t = m * 60 + k * DT;
      const gpu = loadAt(awareTotal, t);
      const bess = bessAt(gpu, t);
      gSum += gpu;
      bSum += bess;
      uSum += loadAt(uniformTotal, t);
      energyKwh += (bess * DT) / 3600;
      bessPeak = Math.max(bessPeak, bess);
      if (t >= EVENT_START_S && t < EVENT_END_S) {
        eventSamples++;
        if (gpu - bess <= target + 1e-6) compliant++;
      }
    }
    const inEvent = m * 60 >= EVENT_START_S && m * 60 < EVENT_END_S;
    minutes.push({
      minute: m,
      label: `T+${m}`,
      inEvent,
      baseline_kw: B,
      target_kw: inEvent ? target : null,
      gpu_aware_kw: gSum / stepsPerMin,
      grid_aware_kw: (gSum - bSum) / stepsPerMin,
      bess_kw: bSum / stepsPerMin,
      uniform_kw: uSum / stepsPerMin,
    });
  }

  const rampDuration = GPU_ACTUATION_LATENCY_S + awareTotal / R;
  const window = Math.min(120, Math.max(6, Math.ceil(rampDuration + 2)));
  const onsetStep = window <= 20 ? 0.1 : window <= 60 ? 0.25 : 0.5;
  const onset: OnsetPoint[] = [];
  const nSteps = Math.round((window + 1) / onsetStep);
  for (let k = 0; k <= nSteps; k++) {
    const s = -1 + k * onsetStep;
    const t = EVENT_START_S + s;
    const gpu = loadAt(awareTotal, t);
    const bess = bessAt(gpu, t);
    onset.push({
      t: Math.round(s * 100) / 100,
      target_kw: s >= 0 ? target : B,
      gpu_aware_kw: gpu,
      grid_aware_kw: gpu - bess,
      bess_kw: bess,
      ...groupShedAt(t),
    });
  }

  // Analytic time from 4CP warning until grid draw ≤ target (and stays there).
  const req = sim.required_reduction_kw;
  let ttc: number | null;
  if (req <= 1e-9) ttc = 0;
  else if (bessMax > 0) {
    ttc = awareTotal + bessMax >= req - 1e-6
      ? Math.max(bessDelay, GPU_ACTUATION_LATENCY_S + Math.max(0, req - bessMax) / R)
      : null;
  } else {
    ttc = awareTotal >= req - 1e-6 ? GPU_ACTUATION_LATENCY_S + req / R : null;
  }

  return {
    minutes,
    onset,
    ramp_duration_s: rampDuration,
    bess_energy_kwh: energyKwh,
    bess_peak_kw: bessPeak,
    time_to_compliance_s: ttc,
    compliance_pct: eventSamples ? (compliant / eventSamples) * 100 : 100,
  };
}
