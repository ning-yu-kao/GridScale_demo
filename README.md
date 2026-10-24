# ⚡ GridScale — Workload-Aware AI Cluster Power Simulator (MVP)

> **"Why Uniform GPU Power Capping Fails, and How Workload-Aware Power Allocation Preserves SLA While Achieving Grid Targets."**

**GridScale** is a public data-driven offline simulator for AI Data Centers participating in grid curtailment and demand response programs (e.g., **ERCOT 4CP Peak Avoidance**). It demonstrates how a marginal-cost, workload-aware power allocator outperforms naive uniform GPU power capping while strictly enforcing per-workload SLA guardrails and sizing Battery Energy Storage System (BESS) dispatch.

---

## 🎯 Key Technical Insights Demonstrated

1. **The Illusion of Power Capping (`Power Limit ≠ Actual Power Draw`)**  
   Memory-bandwidth-bound workloads such as **Online LLM Decode** draw only ~260W in steady state on an NVIDIA H100 SXM GPU despite a 700W TDP cap ([arXiv:2605.11999](https://arxiv.org/abs/2605.11999)). Dropping the GPU power limit from 700W to 400W yields **0W of actual power savings**. Naive uniform power controllers either fail to meet grid targets or crush latency-critical SLAs by forcing caps down to 200W–250W.

2. **Non-Linear Power/Performance Pareto Curve**  
   Based on published **Dell PowerEdge XE9680 (8× H100 SXM, Llama 2 70B Offline)** MLPerf benchmarks, reducing the GPU power limit from 700W to 600W reduces actual GPU power draw by **15%** (680W → 578W) while losing only **6% throughput** (efficiency improves from `2.530` to `2.776` Tokens/s/W).

3. **Honest Engineering Boundaries & Tier-2 BESS Co-Simulation**  
   Every data point is explicitly badged by provenance:
   - 🟢 **Published Benchmark** (Dell XE9680 InfoHub / arXiv:2605.11999 / NVIDIA DGX Redfish Docs)
   - 🔵 **Interpolated** (Piecewise-linear between published points)
   - 🟡 **Model Assumption** (Explicitly flagged synthetic curve)  
   When the requested grid curtailment exceeds the SLA-safe GPU flexibility envelope, GridScale reports the exact **Unmet GPU Power Reduction (kW)** and dispatches a simulated **BESS (Battery Energy Storage System)** to cover the residual demand and ramp transients.

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** `>= 18.x`
- **npm** `>= 9.x`

### Installation & Local Development

```bash
# Clone the repository
git clone https://github.com/ning-yu-kao/GridScale_demo.git
cd GridScale_demo

# Install dependencies
npm install

# Start the interactive development server (http://localhost:5173)
npm run dev
```

### Production Build

```bash
# Run TypeScript type-checking and build production bundle into dist/
npm run build

# Preview production build locally
npm run preview
```

---

## 🧠 Core Algorithmic Architecture

### 1. Piecewise-Linear Power & Provenance Estimator (`src/engine/PowerEstimator.ts`)
Evaluates `(gpuProfile, workloadProfile, targetPowerLimitW)` across discrete 10W steps from `default_limit_w` down to `min_limit_w`, propagating strict provenance metadata (`published_benchmark`, `interpolated`, `assumption`).

### 2. Marginal-Cost Greedy Power Allocator (`src/engine/PowerAllocator.ts`)
At each 10W step, GridScale evaluates all active workload groups that have not yet reached their `max_allowed_perf_loss_pct` SLA ceiling and computes the **Marginal Performance Cost per Actual Watt Saved**:

$$\text{MarginalCost} = \frac{\Delta \text{PerfLossPct} \times \text{PriorityWeight}}{\Delta \text{ActualWattsSaved}}$$

- **Zero-Watt Illusion Skip**: Any step where $\Delta \text{ActualWattsSaved} \le 0$ (such as Online Decode between 700W and 400W) is automatically skipped so latency-critical workloads are never penalized for illusory caps.
- **SLA Hard Guardrail**: Steps that would push a workload group past its `max_allowed_perf_loss_pct` ceiling are forbidden.
- **Tier-2 BESS Routing**: Any remaining shortfall after all groups reach their SLA boundaries is reported as `unmet_power_reduction_kw` and routed to BESS dispatch (`bess_required_kw = unmet_power_reduction_kw`).

### 3. 60-Minute ERCOT 4CP & BESS Co-Simulation (`src/engine/TimelineSimulator.ts`)
Simulates a 60-minute window (with an ERCOT 4CP peak warning from `T=15m` to `T=45m`), modeling:
- Staggered GPU group actuation constrained by facility **Max Ramp Rate Limit (kW/s)**.
- **BESS Response Delay (ms)** (default `500ms`, referencing published 450–715ms round-trip studies) absorbing instantaneous ramp transients and sustained unmet demand.
- Controlled post-event ramp recovery at `T=45m` to prevent rebound spikes.

---

## 🖥️ Dashboard Features

- **Quick Scenario Presets**:
  - *Balanced AI Cloud (1,000× H100)* — 30% Online Decode, 40% Offline Llama-70B Inference, 30% Pre-training, 15% Target Shed
  - *Inference-Heavy Cluster (The Decode Trap)* — 60% Online Decode, 25% Offline Inference, 15% Pre-training, 18% Target Shed
  - *ERCOT 4CP Severe Curtailment (-30% Load Shed + BESS)* — Demonstrates SLA ceilings and BESS activation
- **Executive KPI Cards**: Compares Actual Power Shed Achieved, Weighted SLA/Throughput Impact, Unmet Demand & BESS Dispatch, and Estimated ERCOT 4CP Avoided Penalty (`$65,000/MW-year` tariff assumption).
- **Interactive Visual Analytics**:
  - **Chart 1**: Strategy Comparison Bar Charts (Actual Power Draw, Power Saved, Throughput Loss vs. SLA, Target Coverage)
  - **Chart 2**: Power/Performance Pareto & "Power Cap Illusion" Curves with live operating-point markers
  - **Chart 3**: 60-Minute ERCOT 15-Min Curtailment & BESS Co-Simulation Timeline + Second-by-Second Onset Zoom
- **Data Provenance Audit Table & Phase 2 Hardware Adapter Spec**: Full audit table of all `AllocationNodeResult` rows plus an expandable TypeScript/Python `HardwareAdapter` specification mapping to `nvmlDeviceSetPowerManagementLimit`, `DCGM_FI_DEV_BOARD_POWER_WATTS`, and `vllm:time_to_first_token_seconds`.

---

## 📁 Project Structure

```text
├── index.html
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── App.tsx                             # Main executive & engineering dashboard
    ├── main.tsx                            # React entry point
    ├── index.css                           # Dark mode industrial theme & styles
    ├── types/
    │   └── simulator.ts                    # Core TypeScript interfaces
    ├── data/
    │   └── publicProfiles.ts               # Grounded GPU & workload datasets + citations
    ├── engine/
    │   ├── PowerEstimator.ts               # Piecewise-linear curve & provenance evaluator
    │   ├── PowerAllocator.ts               # Uniform vs. Workload-Aware Marginal-Cost allocator
    │   └── TimelineSimulator.ts            # 60-min ERCOT 4CP + BESS ramp co-simulation
    └── components/
        ├── Header.tsx                      # Top bar & scenario preset buttons
        ├── Sidebar.tsx                     # Cluster composition, grid & BESS controls
        ├── KpiCards.tsx                    # 4 Executive KPI comparison cards
        ├── StrategyCharts.tsx              # Chart 1: Grouped comparison bar charts
        ├── ParetoChart.tsx                 # Chart 2: Pareto & Power Cap Illusion curves
        ├── TimelineChart.tsx               # Chart 3: 60-min ERCOT timeline & onset zoom
        ├── ProvenanceTable.tsx             # Data provenance audit table
        ├── HardwareAdapterDrawer.tsx       # Phase 2 NVML/DCGM/vLLM adapter drawer
        └── ui.tsx                          # Shared UI primitives, badges & hover citations
```

---

## 📚 Grounded Data Sources

- **Dell PowerEdge XE9680 (8× H100 SXM) MLPerf Inference**: [Enabling Efficient LLM Inferencing: Power Capping Strategies for PowerEdge XE9680](https://infohub.delltechnologies.com/en-us/p/enabling-efficient-llm-inferencing-power-capping-strategies-for-poweredge-xe9680/)
- **LLM Decode Power Cap Illusion**: ["The Illusion of Power Capping in LLM Decode" (arXiv:2605.11999)](https://arxiv.org/abs/2605.11999)
- **NVIDIA DGX H100/H200 Power Capping**: [NVIDIA DGX H100 User Guide — Redfish API](https://docs.nvidia.com/dgx/dgxh100-user-guide/redfish-api-supp.html)
- **NVIDIA DGX B200 Power Capping**: [NVIDIA DGX B200 User Guide — Power Capping](https://docs.nvidia.com/dgx/dgxb200-user-guide/power-capping.html)
