import { BatteryCharging, Cpu, Gauge, Server, Zap } from 'lucide-react';
import type { ClusterWorkloadGroup, SimulationConfig, UniformMode } from '../types/simulator';
import { BESS_DELAY_REFERENCE_MS, GPU_PROFILES, WORKLOAD_UI, getGpu, getWorkload } from '../data/publicProfiles';
import { COLORS, InfoTip, Panel, RefLink, Segmented, Slider, SourceBadge, Toggle, fmtKw } from './ui';

interface Props {
  cfg: SimulationConfig;
  onChange: (patch: Partial<SimulationConfig>) => void;
  baselineKw: number;
  requiredKw: number;
}

export default function Sidebar({ cfg, onChange, baselineKw, requiredKw }: Props) {
  const gpu = getGpu(cfg.gpu_id);
  const totalGpus = cfg.groups.reduce((s, g) => s + g.gpu_count, 0);
  const updateGroup = (i: number, patch: Partial<ClusterWorkloadGroup>) =>
    onChange({ groups: cfg.groups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  return (
    <div className="space-y-4">
      <Panel title="Cluster Composition" icon={<Server size={15} />} right={<span className="font-mono text-xs text-slate-400">{totalGpus.toLocaleString()} GPUs</span>}>
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <Cpu size={12} /> GPU Platform
              <InfoTip>
                Power-limit ranges from NVIDIA documentation. Workload curves are published on an H100 700 W base; on B200 they
                are scaled proportionally and therefore flagged <b>Model Assumption</b>.
                <span className="mt-2 block space-y-1">
                  {GPU_PROFILES.map((g) => (
                    <span key={g.id} className="block">
                      <RefLink label={`${g.platform}: ${g.power_capability.min_limit_w}–${g.power_capability.max_limit_w} W`} url={g.source_url} />
                    </span>
                  ))}
                </span>
              </InfoTip>
            </div>
            <Segmented
              value={cfg.gpu_id}
              onChange={(v) => onChange({ gpu_id: v })}
              options={GPU_PROFILES.map((g) => ({
                value: g.id,
                label: (
                  <span>
                    {g.gpu_model.replace('NVIDIA ', '')}{' '}
                    <span className="text-slate-500">{g.power_capability.default_limit_w}W</span>
                  </span>
                ),
              }))}
            />
          </div>

          {cfg.groups.map((g, i) => {
            const wl = getWorkload(g.workload_id);
            const ui = WORKLOAD_UI[g.workload_id];
            return (
              <div key={g.workload_id} className="rounded-lg border border-line bg-bg/50 p-3">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ui.color }} />
                    <div className="text-xs font-semibold leading-snug text-slate-100">{ui.sidebar}</div>
                  </div>
                  <SourceBadge type={wl.source_type} citation={wl.source_citation} url={wl.source_url} compact align="right" />
                </div>
                <div className="space-y-3">
                  <Slider
                    label="GPUs"
                    value={g.gpu_count}
                    display={g.gpu_count.toLocaleString()}
                    min={0}
                    max={2000}
                    step={10}
                    accent={ui.color}
                    onChange={(v) => updateGroup(i, { gpu_count: v })}
                  />
                  <Slider
                    label={
                      <>
                        SLA Max Perf Loss
                        <InfoTip>
                          Hard constraint for the workload-aware allocator. Priority weight: <b>{wl.priority_weight}/10</b>.
                        </InfoTip>
                      </>
                    }
                    value={g.max_allowed_perf_loss_pct}
                    display={`${g.max_allowed_perf_loss_pct}%`}
                    min={0}
                    max={40}
                    step={1}
                    accent={ui.color}
                    onChange={(v) => updateGroup(i, { max_allowed_perf_loss_pct: v })}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Grid Event & Facility" icon={<Zap size={15} />}>
        <div className="space-y-4">
          <Slider
            label={
              <>
                Grid Curtailment Target
                <InfoTip>% of actual baseline IT power. In this MVP, IT power = GPU board power (CPU, fans, cooling excluded).</InfoTip>
              </>
            }
            value={cfg.curtailment_pct}
            display={`${cfg.curtailment_pct}%`}
            min={5}
            max={40}
            step={1}
            onChange={(v) => onChange({ curtailment_pct: v })}
            hint={
              <span className="font-mono">
                {fmtKw(baselineKw)} baseline → shed <span className="text-accent">{fmtKw(requiredKw)}</span>
              </span>
            }
          />
          <Slider
            label={
              <>
                Max Ramp Rate Limit
                <InfoTip>Facility-level ramp constraint applied to GPU power-limit actuation in the timeline co-simulation.</InfoTip>
              </>
            }
            value={cfg.ramp_rate_kw_per_s}
            display={`${cfg.ramp_rate_kw_per_s} kW/s`}
            min={5}
            max={200}
            step={5}
            onChange={(v) => onChange({ ramp_rate_kw_per_s: v })}
          />
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              <Gauge size={12} /> Uniform Baseline Controller
              <InfoTip>
                <b>Naive nameplate:</b> divides the kW target evenly across GPU power limits, assuming 1 W of limit = 1 W of
                power (blind to the decode power-cap illusion).
                <br />
                <b>Closed-loop:</b> keeps lowering the fleet-wide cap until actual power meets the target, ignoring SLAs.
              </InfoTip>
            </div>
            <Segmented<UniformMode>
              value={cfg.uniform_mode}
              onChange={(v) => onChange({ uniform_mode: v })}
              options={[
                { value: 'naive_nameplate', label: 'Naive nameplate' },
                { value: 'closed_loop', label: 'Closed-loop' },
              ]}
            />
          </div>
        </div>
      </Panel>

      <Panel title="Simulated BESS Backup" icon={<BatteryCharging size={15} />}>
        <div className="space-y-4">
          <Toggle
            checked={cfg.bess_enabled}
            onChange={(v) => onChange({ bess_enabled: v })}
            label={<span className="font-medium">Battery storage backup {cfg.bess_enabled ? 'armed' : 'offline'}</span>}
          />
          <Slider
            label="Max Discharge Power"
            value={cfg.bess_max_discharge_mw}
            display={`${cfg.bess_max_discharge_mw.toFixed(2)} MW`}
            min={0}
            max={2}
            step={0.01}
            accent={COLORS.emerald}
            disabled={!cfg.bess_enabled}
            onChange={(v) => onChange({ bess_max_discharge_mw: v })}
          />
          <Slider
            label={
              <>
                BESS Response Delay
                <InfoTip>
                  Default 500 ms, referencing a published {BESS_DELAY_REFERENCE_MS[0]}–{BESS_DELAY_REFERENCE_MS[1]} ms round-trip
                  response study.
                </InfoTip>
              </>
            }
            value={cfg.bess_response_delay_ms}
            display={`${cfg.bess_response_delay_ms} ms`}
            min={50}
            max={2000}
            step={10}
            accent={COLORS.emerald}
            disabled={!cfg.bess_enabled}
            onChange={(v) => onChange({ bess_response_delay_ms: v })}
            hint={`Reference band: ${BESS_DELAY_REFERENCE_MS[0]}–${BESS_DELAY_REFERENCE_MS[1]} ms`}
          />
        </div>
      </Panel>

      <p className="px-1 text-[11px] leading-relaxed text-slate-500">
        Power limits on {gpu.platform}: {gpu.power_capability.min_limit_w}–{gpu.power_capability.max_limit_w} W, allocator step 10 W.
      </p>
    </div>
  );
}

