import type { GPUProfile, PowerEstimate, WorkloadProfile } from '../types/simulator';

/** All workload curves are published / modelled against an H100 700 W default limit. */
export const CURVE_BASE_LIMIT_W = 700;
export const LIMIT_STEP_W = 10;
const EPS = 1e-6;

/** Ratio used to map H100-based curves onto other platforms (e.g. B200 1000 W → 1.4286). */
export function platformScale(gpu: GPUProfile): number {
  return gpu.power_capability.default_limit_w / CURVE_BASE_LIMIT_W;
}

/** Discrete power-limit steps, descending from default_limit_w to min_limit_w in 10 W increments. */
export function limitSteps(gpu: GPUProfile): number[] {
  const { default_limit_w, min_limit_w } = gpu.power_capability;
  const out: number[] = [];
  for (let l = default_limit_w; l >= min_limit_w; l -= LIMIT_STEP_W) out.push(l);
  if (out[out.length - 1] !== min_limit_w) out.push(min_limit_w);
  return out;
}

/**
 * PowerEstimator — deterministic piecewise-linear estimate for (gpu, workload, targetPowerLimitW).
 *
 * source_type rules:
 *  - exact curve point        → that point's source_type
 *  - between two points       → 'interpolated', unless either neighbour is 'assumption' → 'assumption'
 *  - below the lowest point   → proportional extrapolation, flagged 'assumption'
 *  - non-H100 platform        → curve is scaled from the H100 base, flagged 'assumption'
 */
export function estimatePower(gpu: GPUProfile, workload: WorkloadProfile, targetPowerLimitW: number): PowerEstimate {
  const { min_limit_w, max_limit_w } = gpu.power_capability;
  const scale = platformScale(gpu);
  const limit = Math.min(max_limit_w, Math.max(min_limit_w, targetPowerLimitW));
  const L = limit / scale; // limit expressed on the H100 700 W base

  const pts = [...workload.curve].sort((a, b) => a.power_limit_w - b.power_limit_w);
  const lowest = pts[0];
  const highest = pts[pts.length - 1];

  let actual: number;
  let thr: number;
  let eff: number | undefined;
  let source = lowest.source_type;
  let extrapolated = false;

  const exact = pts.find((p) => Math.abs(p.power_limit_w - L) < EPS);
  if (exact) {
    actual = exact.estimated_actual_power_w;
    thr = exact.relative_throughput_pct;
    eff = exact.efficiency_tokens_per_s_w;
    source = exact.source_type;
  } else if (L > highest.power_limit_w) {
    actual = highest.estimated_actual_power_w;
    thr = highest.relative_throughput_pct;
    eff = highest.efficiency_tokens_per_s_w;
    source = 'assumption';
  } else if (L < lowest.power_limit_w) {
    const f = L / lowest.power_limit_w;
    actual = lowest.estimated_actual_power_w * f;
    thr = lowest.relative_throughput_pct * f;
    source = 'assumption';
    extrapolated = true;
  } else {
    const hiIdx = pts.findIndex((p) => p.power_limit_w > L);
    const lo = pts[hiIdx - 1];
    const hi = pts[hiIdx];
    const t = (L - lo.power_limit_w) / (hi.power_limit_w - lo.power_limit_w);
    const lerp = (a: number, b: number) => a + (b - a) * t;
    actual = lerp(lo.estimated_actual_power_w, hi.estimated_actual_power_w);
    thr = lerp(lo.relative_throughput_pct, hi.relative_throughput_pct);
    eff =
      lo.efficiency_tokens_per_s_w !== undefined && hi.efficiency_tokens_per_s_w !== undefined
        ? lerp(lo.efficiency_tokens_per_s_w, hi.efficiency_tokens_per_s_w)
        : undefined;
    source = lo.source_type === 'assumption' || hi.source_type === 'assumption' ? 'assumption' : 'interpolated';
  }

  if (Math.abs(scale - 1) > EPS) source = 'assumption';

  return {
    power_limit_w: limit,
    estimated_actual_power_w: actual * scale,
    relative_throughput_pct: thr,
    predicted_perf_loss_pct: Math.max(0, 100 - thr),
    efficiency_tokens_per_s_w: eff,
    source_type: source,
    extrapolated,
  };
}
