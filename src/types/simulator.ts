export type DataSourceType = 'published_benchmark' | 'interpolated' | 'assumption' | 'unavailable';

export interface GPUProfile {
  id: string;
  gpu_model: string;
  platform: string;
  power_capability: {
    min_limit_w: number;
    max_limit_w: number;
    default_limit_w: number;
  };
  source_url: string;
}

export interface PowerPerfPoint {
  power_limit_w: number;
  estimated_actual_power_w: number;
  efficiency_tokens_per_s_w?: number;
  relative_throughput_pct: number; // 100% at default limit
  estimated_latency_impact_pct: number | null; // null if unavailable
  source_type: DataSourceType;
}

export interface WorkloadProfile {
  id: string;
  name: string;
  category: 'online_decode' | 'offline_inference' | 'pretraining';
  gpu_model: string;
  description: string;
  priority_weight: number; // 1 (lowest) to 10 (highest SLA sensitivity)
  default_max_perf_loss_pct: number; // SLA constraint boundary
  curve: PowerPerfPoint[];
  source_type: DataSourceType;
  source_citation: string;
  source_url: string;
}

export interface ClusterWorkloadGroup {
  workload_id: string;
  gpu_count: number;
  max_allowed_perf_loss_pct: number;
}

export interface AllocationNodeResult {
  workload_id: string;
  workload_name: string;
  gpu_count: number;
  baseline_power_limit_w: number;
  assigned_power_limit_w: number;
  baseline_actual_power_kw: number;
  predicted_actual_power_kw: number;
  actual_power_saved_kw: number;
  predicted_perf_loss_pct: number;
  sla_violated: boolean;
  source_type: DataSourceType;
}

export interface StrategyComparisonResult {
  strategy_name: 'No Optimization' | 'Uniform Power Capping' | 'Workload-Aware Allocation';
  total_baseline_power_kw: number;
  target_power_budget_kw: number;
  required_reduction_kw: number;
  achieved_reduction_kw: number;
  predicted_total_power_kw: number;
  unmet_power_reduction_kw: number; // Must be >= 0
  weighted_avg_perf_loss_pct: number;
  sla_violations_count: number;
  bess_required_kw: number;
  node_results: AllocationNodeResult[];
}

/* ------------------------------------------------------------------ */
/* Extensions used by the engine & dashboard                           */
/* ------------------------------------------------------------------ */

/** Output of PowerEstimator for one (GPU, workload, power-limit) triple. */
export interface PowerEstimate {
  power_limit_w: number;
  estimated_actual_power_w: number;
  relative_throughput_pct: number;
  predicted_perf_loss_pct: number; // 100 − relative_throughput_pct
  efficiency_tokens_per_s_w?: number;
  source_type: DataSourceType;
  /** true when the limit lies below the lowest published/modelled point (proportional extrapolation). */
  extrapolated: boolean;
}

/**
 * How the baseline controller picks its uniform cap.
 *  - naive_nameplate: assumes "1 W of limit = 1 W of power" → divides the kW target evenly across GPU limits.
 *  - closed_loop:     keeps lowering the fleet-wide cap until actual power meets the target (SLA-blind).
 */
export type UniformMode = 'naive_nameplate' | 'closed_loop';

export interface SimulationConfig {
  gpu_id: string;
  groups: ClusterWorkloadGroup[];
  curtailment_pct: number; // % of actual baseline IT (GPU) power
  ramp_rate_kw_per_s: number;
  bess_enabled: boolean;
  bess_max_discharge_mw: number;
  bess_response_delay_ms: number;
  uniform_mode: UniformMode;
}

export interface BessDispatch {
  enabled: boolean;
  requested_kw: number; // = unmet GPU reduction of the workload-aware plan
  dispatched_kw: number; // limited by max discharge power
  residual_unmet_kw: number; // still uncovered after BESS
}

export interface SimulationResult {
  baseline_kw: number;
  required_reduction_kw: number;
  target_power_kw: number;
  uniform_cap_w: number;
  none: StrategyComparisonResult;
  uniform: StrategyComparisonResult;
  aware: StrategyComparisonResult;
  bess: BessDispatch;
}
