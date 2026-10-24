import type { ClusterWorkloadGroup, DataSourceType, GPUProfile, WorkloadProfile } from '../types/simulator';

/* ------------------------------------------------------------------ */
/* Public references                                                    */
/* ------------------------------------------------------------------ */

export const REFS = {
  dell: {
    label: 'Dell PowerEdge XE9680 (8x H100 SXM) MLPerf Inference — Power Capping Strategies',
    url: 'https://infohub.delltechnologies.com/en-us/p/enabling-efficient-llm-inferencing-power-capping-strategies-for-poweredge-xe9680/',
  },
  arxivDecode: {
    label: '"The Illusion of Power Capping in LLM Decode" (arXiv:2605.11999)',
    url: 'https://arxiv.org/abs/2605.11999',
  },
  h100Redfish: {
    label: 'NVIDIA DGX H100/H200 Redfish API Documentation',
    url: 'https://docs.nvidia.com/dgx/dgxh100-user-guide/redfish-api-supp.html',
  },
  b200Capping: {
    label: 'NVIDIA DGX B200 User Guide — Power Capping',
    url: 'https://docs.nvidia.com/dgx/dgxb200-user-guide/power-capping.html',
  },
} as const;

export const SOURCE_TYPE_INFO: Record<DataSourceType, { label: string; description: string; refs: { label: string; url: string }[] }> = {
  published_benchmark: {
    label: 'Published Benchmark',
    description: 'Taken directly from a public, citable source.',
    refs: [REFS.dell, REFS.arxivDecode, REFS.h100Redfish, REFS.b200Capping],
  },
  interpolated: {
    label: 'Interpolated',
    description: 'Piecewise-linear between published benchmark points.',
    refs: [],
  },
  assumption: {
    label: 'Model Assumption',
    description: 'Explicitly flagged synthetic curve / extrapolation. Validate with site telemetry before production.',
    refs: [],
  },
  unavailable: {
    label: 'Unavailable',
    description: 'No defensible public number — never fabricated.',
    refs: [],
  },
};

/* ------------------------------------------------------------------ */
/* 4.1 GPU Profiles                                                     */
/* ------------------------------------------------------------------ */

export const GPU_PROFILES: GPUProfile[] = [
  {
    id: 'h100_sxm_dgx',
    gpu_model: 'NVIDIA H100 SXM',
    platform: 'DGX H100',
    power_capability: { min_limit_w: 200, max_limit_w: 700, default_limit_w: 700 },
    source_url: REFS.h100Redfish.url,
  },
  {
    id: 'b200_dgx',
    gpu_model: 'NVIDIA B200',
    platform: 'DGX B200',
    power_capability: { min_limit_w: 200, max_limit_w: 1000, default_limit_w: 1000 },
    source_url: REFS.b200Capping.url,
  },
];

/* ------------------------------------------------------------------ */
/* 4.2 Workload Profiles (mapped to H100 700 W base)                    */
/* ------------------------------------------------------------------ */

export const WORKLOAD_PROFILES: WorkloadProfile[] = [
  {
    id: 'llm_memory_bound_decode',
    name: 'Online Real-Time LLM Decode (Latency Critical)',
    category: 'online_decode',
    gpu_model: 'NVIDIA H100 SXM',
    description:
      'Memory-bound attention decode draws only ~260 W in steady state despite a 700 W cap. Setting Power Limit between 300 W and 700 W produces zero actual power reduction!',
    priority_weight: 10,
    default_max_perf_loss_pct: 3,
    source_type: 'published_benchmark',
    source_citation: REFS.arxivDecode.label,
    source_url: REFS.arxivDecode.url,
    curve: [
      { power_limit_w: 700, estimated_actual_power_w: 260, relative_throughput_pct: 100, estimated_latency_impact_pct: null, source_type: 'published_benchmark' },
      { power_limit_w: 600, estimated_actual_power_w: 260, relative_throughput_pct: 100, estimated_latency_impact_pct: null, source_type: 'published_benchmark' },
      { power_limit_w: 500, estimated_actual_power_w: 260, relative_throughput_pct: 100, estimated_latency_impact_pct: null, source_type: 'published_benchmark' },
      { power_limit_w: 400, estimated_actual_power_w: 260, relative_throughput_pct: 100, estimated_latency_impact_pct: null, source_type: 'published_benchmark' },
      { power_limit_w: 300, estimated_actual_power_w: 255, relative_throughput_pct: 97.0, estimated_latency_impact_pct: null, source_type: 'interpolated' },
      { power_limit_w: 250, estimated_actual_power_w: 230, relative_throughput_pct: 82.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 200, estimated_actual_power_w: 195, relative_throughput_pct: 64.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
    ],
  },
  {
    id: 'dell_llama2_70b_offline',
    name: 'LLM Offline Batch Inference (Llama 2 70B)',
    category: 'offline_inference',
    gpu_model: 'NVIDIA H100 SXM',
    description:
      'Compute-heavy batch inference. 700 W → 600 W cuts actual power 15% for only 6% throughput loss; efficiency rises from 2.530 to 2.776 Tokens/s/W.',
    priority_weight: 5,
    default_max_perf_loss_pct: 12,
    source_type: 'published_benchmark',
    source_citation: REFS.dell.label,
    source_url: REFS.dell.url,
    curve: [
      { power_limit_w: 700, estimated_actual_power_w: 680, efficiency_tokens_per_s_w: 2.53, relative_throughput_pct: 100, estimated_latency_impact_pct: null, source_type: 'published_benchmark' },
      { power_limit_w: 600, estimated_actual_power_w: 578, efficiency_tokens_per_s_w: 2.776, relative_throughput_pct: 94.0, estimated_latency_impact_pct: null, source_type: 'published_benchmark' },
      // Efficiency at 500 W / 450 W is published; actual power & throughput are interpolated → point flagged 'interpolated'.
      { power_limit_w: 500, estimated_actual_power_w: 485, efficiency_tokens_per_s_w: 2.96, relative_throughput_pct: 84.5, estimated_latency_impact_pct: null, source_type: 'interpolated' },
      { power_limit_w: 450, estimated_actual_power_w: 440, efficiency_tokens_per_s_w: 3.005, relative_throughput_pct: 78.0, estimated_latency_impact_pct: null, source_type: 'interpolated' },
      { power_limit_w: 350, estimated_actual_power_w: 350, relative_throughput_pct: 60.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
    ],
  },
  {
    id: 'dense_gemm_pretraining',
    name: 'Distributed LLM Pre-Training / Prefill (Compute-Bound)',
    category: 'pretraining',
    gpu_model: 'NVIDIA H100 SXM',
    description:
      'Compute-bound workloads saturate TDP (700 W). Power capping directly reduces actual watts, with moderate non-linear throughput degradation.',
    priority_weight: 3,
    default_max_perf_loss_pct: 18,
    source_type: 'assumption',
    source_citation: 'Modelled Compute-Bound GEMM Power/Frequency Pareto Curve',
    source_url: '',
    curve: [
      { power_limit_w: 700, estimated_actual_power_w: 700, relative_throughput_pct: 100, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 650, estimated_actual_power_w: 650, relative_throughput_pct: 97.5, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 600, estimated_actual_power_w: 600, relative_throughput_pct: 94.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 550, estimated_actual_power_w: 550, relative_throughput_pct: 89.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 500, estimated_actual_power_w: 500, relative_throughput_pct: 82.5, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 450, estimated_actual_power_w: 450, relative_throughput_pct: 74.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
      { power_limit_w: 400, estimated_actual_power_w: 400, relative_throughput_pct: 64.0, estimated_latency_impact_pct: null, source_type: 'assumption' },
    ],
  },
];

/** Dashboard labels & colors per workload. */
export const WORKLOAD_UI: Record<string, { short: string; sidebar: string; color: string }> = {
  llm_memory_bound_decode: { short: 'Online Decode', sidebar: 'Online LLM Decode (H200/H100 Memory-Bound)', color: '#A78BFA' },
  dell_llama2_70b_offline: { short: 'Offline Llama-70B', sidebar: 'Offline LLM Batch Inference (Dell XE9680 Llama2-70B)', color: '#3B82F6' },
  dense_gemm_pretraining: { short: 'Pre-Training', sidebar: 'Distributed Pre-Training (Compute-Bound GEMM)', color: '#22D3EE' },
};

export const getWorkload = (id: string): WorkloadProfile => {
  const w = WORKLOAD_PROFILES.find((p) => p.id === id);
  if (!w) throw new Error(`Unknown workload ${id}`);
  return w;
};

export const getGpu = (id: string): GPUProfile => {
  const g = GPU_PROFILES.find((p) => p.id === id);
  if (!g) throw new Error(`Unknown GPU ${id}`);
  return g;
};

/* ------------------------------------------------------------------ */
/* Facility / market constants                                          */
/* ------------------------------------------------------------------ */

/** Illustrative ERCOT transmission 4CP tariff assumption. */
export const ERCOT_4CP_USD_PER_MW_YEAR = 65_000;

/** Published 450–715 ms round-trip study, used as the BESS response-delay reference range. */
export const BESS_DELAY_REFERENCE_MS: [number, number] = [450, 715];

/** GPU power-limit command → settled draw (NVML set + firmware settle). Model assumption. */
export const GPU_ACTUATION_LATENCY_S = 1.0;

/* ------------------------------------------------------------------ */
/* Scenario presets                                                     */
/* ------------------------------------------------------------------ */

export interface ScenarioPreset {
  id: string;
  name: string;
  tagline: string;
  curtailment_pct: number;
  bess_enabled: boolean;
  bess_max_discharge_mw: number;
  groups: ClusterWorkloadGroup[];
}

const g = (decode: number, offline: number, pretrain: number): ClusterWorkloadGroup[] => [
  { workload_id: 'llm_memory_bound_decode', gpu_count: decode, max_allowed_perf_loss_pct: 3 },
  { workload_id: 'dell_llama2_70b_offline', gpu_count: offline, max_allowed_perf_loss_pct: 12 },
  { workload_id: 'dense_gemm_pretraining', gpu_count: pretrain, max_allowed_perf_loss_pct: 18 },
];

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced AI Cloud (1,000x H100)',
    tagline: '30% Decode · 40% Offline · 30% Training · Shed 15%',
    curtailment_pct: 15,
    bess_enabled: true,
    bess_max_discharge_mw: 0.5,
    groups: g(300, 400, 300),
  },
  {
    id: 'decode_trap',
    name: 'Inference-Heavy Cluster (The Decode Trap)',
    tagline: '60% Decode · 25% Offline · 15% Training · Shed 18%',
    curtailment_pct: 18,
    bess_enabled: true,
    bess_max_discharge_mw: 0.5,
    groups: g(600, 250, 150),
  },
  {
    id: 'ercot_severe',
    name: 'ERCOT 4CP Severe Curtailment (-30% Load Shed + BESS)',
    tagline: 'SLA ceilings hit → BESS covers unmet demand',
    curtailment_pct: 30,
    bess_enabled: true,
    bess_max_discharge_mw: 0.5,
    groups: g(300, 400, 300),
  },
];
