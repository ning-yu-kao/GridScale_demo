import { useMemo, useState } from 'react';
import { BarChart3, Grid2X2, LineChart, Radio, ShieldCheck } from 'lucide-react';
import type { SimulationConfig } from './types/simulator';
import { SCENARIO_PRESETS } from './data/publicProfiles';
import { runSimulation } from './engine/PowerAllocator';
import { simulateTimeline } from './engine/TimelineSimulator';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import KpiCards from './components/KpiCards';
import StrategyCharts from './components/StrategyCharts';
import ParetoChart from './components/ParetoChart';
import TimelineChart from './components/TimelineChart';
import ProvenanceTable from './components/ProvenanceTable';
import HardwareAdapterDrawer from './components/HardwareAdapterDrawer';
import { Panel } from './components/ui';

type ChartView = 'all' | 'strategy' | 'pareto' | 'timeline';

const VIEWS: { id: ChartView; label: string; icon: JSX.Element }[] = [
  { id: 'all', label: 'All Charts (Grid)', icon: <Grid2X2 size={14} /> },
  { id: 'strategy', label: '1 · Strategy Comparison', icon: <BarChart3 size={14} /> },
  { id: 'pareto', label: '2 · Pareto & Power Cap Illusion', icon: <LineChart size={14} /> },
  { id: 'timeline', label: '3 · ERCOT 15-Min & BESS Timeline', icon: <Radio size={14} /> },
];

const DEFAULT_PRESET = SCENARIO_PRESETS[0];

export default function App() {
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id);
  const [view, setView] = useState<ChartView>('all');
  const [cfg, setCfg] = useState<SimulationConfig>({
    gpu_id: 'h100_sxm_dgx',
    groups: DEFAULT_PRESET.groups.map((g) => ({ ...g })),
    curtailment_pct: DEFAULT_PRESET.curtailment_pct,
    ramp_rate_kw_per_s: 50,
    bess_enabled: DEFAULT_PRESET.bess_enabled,
    bess_max_discharge_mw: DEFAULT_PRESET.bess_max_discharge_mw,
    bess_response_delay_ms: 500,
    uniform_mode: 'naive_nameplate',
  });

  const sim = useMemo(() => runSimulation(cfg), [cfg]);
  const tl = useMemo(() => simulateTimeline(cfg, sim), [cfg, sim]);

  const applyPreset = (id: string) => {
    const p = SCENARIO_PRESETS.find((s) => s.id === id);
    if (!p) return;
    setPresetId(id);
    setCfg((prev) => ({
      ...prev,
      groups: p.groups.map((g) => ({ ...g })),
      curtailment_pct: p.curtailment_pct,
      bess_enabled: p.bess_enabled,
      bess_max_discharge_mw: p.bess_max_discharge_mw,
    }));
  };

  const updateCfg = (patch: Partial<SimulationConfig>) => {
    setPresetId(null);
    setCfg((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="min-h-screen text-slate-200">
      <Header presetId={presetId} onPreset={applyPreset} />

      <main className="mx-auto grid max-w-[1680px] grid-cols-1 gap-5 px-6 py-5 lg:grid-cols-[360px_1fr]">
        {/* Left Sidebar */}
        <aside className="lg:sticky lg:top-[84px] lg:max-h-[calc(100vh-100px)] lg:overflow-y-auto lg:pr-1">
          <Sidebar cfg={cfg} onChange={updateCfg} baselineKw={sim.baseline_kw} requiredKw={sim.required_reduction_kw} />
        </aside>

        {/* Center / Main */}
        <div className="min-w-0 space-y-5">
          {/* Executive KPI Comparison Cards */}
          <KpiCards sim={sim} />

          {/* Interactive Visual Analytics switcher */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel px-4 py-2.5">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Interactive Visual Analytics</div>
            <div className="flex flex-wrap gap-1.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setView(v.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    view === v.id
                      ? 'border-accent bg-accent/15 text-slate-50'
                      : 'border-line bg-bg/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  {v.icon}
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {(view === 'all' || view === 'strategy') && (
            <Panel
              title="Chart 1 · Strategy Comparison (Uniform Power Capping vs. Workload-Aware Allocation)"
              icon={<BarChart3 size={15} />}
              right={
                <span className="font-mono text-xs text-slate-400">
                  Uniform cap: {sim.uniform_cap_w} W · Target shed: {sim.required_reduction_kw.toFixed(1)} kW
                </span>
              }
            >
              <StrategyCharts sim={sim} groups={cfg.groups} />
            </Panel>
          )}

          {(view === 'all' || view === 'pareto') && (
            <Panel
              title='Chart 2 · Power/Performance Pareto & "Power Cap Illusion" Curve'
              icon={<LineChart size={15} />}
              right={<span className="text-xs text-slate-400">Operating points marked on curve</span>}
            >
              <ParetoChart sim={sim} gpuId={cfg.gpu_id} />
            </Panel>
          )}

          {(view === 'all' || view === 'timeline') && (
            <Panel
              title="Chart 3 · ERCOT 15-Minute Curtailment & BESS Co-Simulation Timeline"
              icon={<Radio size={15} />}
              right={<span className="font-mono text-xs text-slate-400">T=15 min → T=45 min · 1-min resolution</span>}
            >
              <TimelineChart cfg={cfg} sim={sim} tl={tl} />
            </Panel>
          )}

          {/* Bottom Section: Data Provenance, Architecture & Engineering Guardrails */}
          <Panel
            title="Data Provenance, Architecture & Engineering Guardrails"
            icon={<ShieldCheck size={15} />}
            right={<span className="text-xs text-slate-400">Audit of all active AllocationNodeResult rows</span>}
          >
            <ProvenanceTable sim={sim} groups={cfg.groups} />
          </Panel>

          <HardwareAdapterDrawer />
        </div>
      </main>

      <footer className="border-t border-line py-4 text-center text-[11px] text-slate-500">
        GridScale MVP · Deterministic client-side simulator · Every data point badged by provenance (Published / Interpolated / Model Assumption).
      </footer>
    </div>
  );
}
