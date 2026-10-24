import type {
  AllocationNodeResult,
  ClusterWorkloadGroup,
  GPUProfile,
  PowerEstimate,
  SimulationConfig,
  SimulationResult,
  StrategyComparisonResult,
  UniformMode,
} from '../types/simulator';
import { getGpu, getWorkload } from '../data/publicProfiles';
import { LIMIT_STEP_W, estimatePower, limitSteps } from './PowerEstimator';

const EPS = 1e-9;

function buildNode(gpu: GPUProfile, group: ClusterWorkloadGroup, assignedLimitW: number): AllocationNodeResult {
  const wl = getWorkload(group.workload_id);
  const base = estimatePower(gpu, wl, gpu.power_capability.default_limit_w);
  const cur = estimatePower(gpu, wl, assignedLimitW);
  const baseKw = (base.estimated_actual_power_w * group.gpu_count) / 1000;
  const curKw = (cur.estimated_actual_power_w * group.gpu_count) / 1000;
  return {
    workload_id: wl.id,
    workload_name: wl.name,
    gpu_count: group.gpu_count,
    baseline_power_limit_w: base.power_limit_w,
    assigned_power_limit_w: cur.power_limit_w,
    baseline_actual_power_kw: baseKw,
    predicted_actual_power_kw: curKw,
    actual_power_saved_kw: baseKw - curKw,
    predicted_perf_loss_pct: cur.predicted_perf_loss_pct,
    sla_violated: group.gpu_count > 0 && cur.predicted_perf_loss_pct > group.max_allowed_perf_loss_pct + EPS,
    source_type: cur.source_type,
  };
}

/** Throughput loss weighted by GPU count × SLA priority weight. */
export function weightedLoss(nodes: AllocationNodeResult[]): number {
  let num = 0;
  let den = 0;
  for (const n of nodes) {
    const w = n.gpu_count * getWorkload(n.workload_id).priority_weight;
    num += n.predicted_perf_loss_pct * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

function summarize(
  name: StrategyComparisonResult['strategy_name'],
  nodes: AllocationNodeResult[],
  requiredKw: number,
): StrategyComparisonResult {
  const baseline = nodes.reduce((s, n) => s + n.baseline_actual_power_kw, 0);
  const predicted = nodes.reduce((s, n) => s + n.predicted_actual_power_kw, 0);
  const achieved = baseline - predicted;
  const unmet = Math.max(0, requiredKw - achieved);
  return {
    strategy_name: name,
    total_baseline_power_kw: baseline,
    target_power_budget_kw: baseline - requiredKw,
    required_reduction_kw: requiredKw,
    achieved_reduction_kw: achieved,
    predicted_total_power_kw: predicted,
    unmet_power_reduction_kw: unmet,
    weighted_avg_perf_loss_pct: weightedLoss(nodes),
    sla_violations_count: nodes.filter((n) => n.sla_violated).length,
    bess_required_kw: unmet,
    node_results: nodes,
  };
}

export function baselinePowerKw(gpu: GPUProfile, groups: ClusterWorkloadGroup[]): number {
  return groups.reduce(
    (s, g) =>
      s + (estimatePower(gpu, getWorkload(g.workload_id), gpu.power_capability.default_limit_w).estimated_actual_power_w * g.gpu_count) / 1000,
    0,
  );
}

export function noOptimization(gpu: GPUProfile, groups: ClusterWorkloadGroup[], requiredKw: number) {
  return summarize('No Optimization', groups.map((g) => buildNode(gpu, g, gpu.power_capability.default_limit_w)), requiredKw);
}

/**
 * Baseline Algorithm — Uniform Power Capping (naive industry approach).
 * Every GPU gets the same power limit, regardless of workload.
 */
export function uniformPowerCapping(
  gpu: GPUProfile,
  groups: ClusterWorkloadGroup[],
  requiredKw: number,
  mode: UniformMode,
): { result: StrategyComparisonResult; capW: number } {
  const { default_limit_w, min_limit_w } = gpu.power_capability;
  const totalGpus = groups.reduce((s, g) => s + g.gpu_count, 0);
  let cap = default_limit_w;

  if (totalGpus > 0 && requiredKw > EPS) {
    if (mode === 'naive_nameplate') {
      // Assumes 1 W of limit headroom == 1 W of actual power. Blind to the decode power-cap illusion.
      const perGpuW = (requiredKw * 1000) / totalGpus;
      cap = default_limit_w - Math.ceil(perGpuW / LIMIT_STEP_W - EPS) * LIMIT_STEP_W;
    } else {
      // Closed-loop: keep squeezing the fleet-wide cap until actual power meets the target (SLA-blind).
      cap = min_limit_w;
      for (const l of limitSteps(gpu)) {
        const achieved = groups.reduce((s, g) => s + buildNode(gpu, g, l).actual_power_saved_kw, 0);
        if (achieved >= requiredKw - EPS) {
          cap = l;
          break;
        }
      }
    }
    cap = Math.max(min_limit_w, Math.min(default_limit_w, cap));
  }
  return {
    result: summarize('Uniform Power Capping', groups.map((g) => buildNode(gpu, g, cap)), requiredKw),
    capW: cap,
  };
}

/**
 * Core Innovation — Workload-Aware Greedy / Marginal-Cost Allocator.
 *
 *   MarginalCost = (ΔPerfLossPct × PriorityWeight) / ΔActualWattsSaved   (per GPU)
 *
 *  - Steps of 10 W from default_limit_w down to min_limit_w.
 *  - Steps with ΔActualWattsSaved ≤ 0 are skipped (e.g. decode between 700 W and 400 W).
 *  - A step that would exceed a group's max_allowed_perf_loss_pct is forbidden (SLA hard constraint).
 *  - Stops when achieved ≥ required, or when every group has hit its SLA ceiling → remainder = unmet.
 */
export function workloadAwareAllocation(
  gpu: GPUProfile,
  groups: ClusterWorkloadGroup[],
  requiredKw: number,
): StrategyComparisonResult {
  const steps = limitSteps(gpu);
  const workloads = groups.map((g) => getWorkload(g.workload_id));
  const est: PowerEstimate[][] = workloads.map((w) => steps.map((l) => estimatePower(gpu, w, l)));
  const idx = groups.map(() => 0);
  let achievedKw = 0;

  for (let guard = 0; guard < 100_000 && achievedKw < requiredKw - EPS; guard++) {
    let best: { i: number; j: number; cost: number; kw: number } | null = null;

    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      if (g.gpu_count <= 0) continue;
      const cur = est[i][idx[i]];
      for (let j = idx[i] + 1; j < steps.length; j++) {
        const nxt = est[i][j];
        if (nxt.predicted_perf_loss_pct > g.max_allowed_perf_loss_pct + EPS) break; // SLA ceiling reached
        const dW = cur.estimated_actual_power_w - nxt.estimated_actual_power_w;
        if (dW <= EPS) continue; // zero power benefit → skip step
        const dLoss = Math.max(0, nxt.predicted_perf_loss_pct - cur.predicted_perf_loss_pct);
        const cost = (dLoss * workloads[i].priority_weight) / dW;
        const kw = (dW * g.gpu_count) / 1000;
        if (!best || cost < best.cost - EPS || (Math.abs(cost - best.cost) <= EPS && kw > best.kw)) {
          best = { i, j, cost, kw };
        }
        break; // only the next beneficial step is the marginal step for this group
      }
    }

    if (!best) break; // all groups at SLA ceiling
    idx[best.i] = best.j;
    achievedKw += best.kw;
  }

  return summarize(
    'Workload-Aware Allocation',
    groups.map((g, i) => buildNode(gpu, g, steps[idx[i]])),
    requiredKw,
  );
}

/** One-shot deterministic simulation used by the dashboard. */
export function runSimulation(cfg: SimulationConfig): SimulationResult {
  const gpu = getGpu(cfg.gpu_id);
  const baseline = baselinePowerKw(gpu, cfg.groups);
  const required = (baseline * cfg.curtailment_pct) / 100;
  const uni = uniformPowerCapping(gpu, cfg.groups, required, cfg.uniform_mode);
  const aware = workloadAwareAllocation(gpu, cfg.groups, required);
  const maxKw = cfg.bess_enabled ? cfg.bess_max_discharge_mw * 1000 : 0;
  const dispatched = Math.min(aware.bess_required_kw, maxKw);
  return {
    baseline_kw: baseline,
    required_reduction_kw: required,
    target_power_kw: baseline - required,
    uniform_cap_w: uni.capW,
    none: noOptimization(gpu, cfg.groups, required),
    uniform: uni.result,
    aware,
    bess: {
      enabled: cfg.bess_enabled,
      requested_kw: aware.bess_required_kw,
      dispatched_kw: dispatched,
      residual_unmet_kw: Math.max(0, aware.bess_required_kw - dispatched),
    },
  };
}
