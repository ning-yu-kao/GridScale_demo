import { useState } from 'react';
import { Check, ChevronDown, Copy, Plug } from 'lucide-react';
import { Segmented } from './ui';

const TS_SPEC = `// Phase 2 — HardwareAdapter: plugs the offline allocator into real racks.
export interface GpuTelemetry {
  gpu_uuid: string;
  board_power_w: number;        // DCGM_FI_DEV_BOARD_POWER_WATTS
  power_limit_w: number;        // nvmlDeviceGetPowerManagementLimit (mW → W)
  timestamp_ms: number;
}

export interface SlaTelemetry {
  workload_id: string;
  ttft_p95_s: number;           // vllm:time_to_first_token_seconds (histogram, p95)
}

export interface HardwareAdapter {
  /** Discover GPUs and their supported power-limit range. */
  listGpus(): Promise<{ gpu_uuid: string; min_limit_w: number; max_limit_w: number; default_limit_w: number }[]>;

  /** Apply a power limit → nvmlDeviceSetPowerManagementLimit(device, limit_mw). Requires root. */
  setPowerLimit(gpu_uuid: string, limit_w: number): Promise<void>;

  /** Read actual board power → DCGM field DCGM_FI_DEV_BOARD_POWER_WATTS. */
  readBoardPower(gpu_uuids: string[]): Promise<GpuTelemetry[]>;

  /** Read SLA signal → Prometheus vllm:time_to_first_token_seconds. */
  readSla(workload_id: string): Promise<SlaTelemetry>;

  /** Safety: restore default limits on event end / controller fault. */
  restoreDefaults(): Promise<void>;
}`;

const PY_SPEC = `# Phase 2 — HardwareAdapter: plugs the offline allocator into real racks.
from abc import ABC, abstractmethod
from dataclasses import dataclass
import pynvml


@dataclass
class GpuTelemetry:
    gpu_uuid: str
    board_power_w: float   # DCGM_FI_DEV_BOARD_POWER_WATTS
    power_limit_w: float   # nvmlDeviceGetPowerManagementLimit (mW -> W)
    timestamp_ms: int


class HardwareAdapter(ABC):
    @abstractmethod
    def set_power_limit(self, gpu_uuid: str, limit_w: int) -> None: ...

    @abstractmethod
    def read_board_power(self, gpu_uuids: list[str]) -> list[GpuTelemetry]: ...

    @abstractmethod
    def read_ttft_p95_s(self, workload_id: str) -> float:
        """Prometheus: vllm:time_to_first_token_seconds (histogram_quantile 0.95)."""

    @abstractmethod
    def restore_defaults(self) -> None: ...


class NvmlDcgmAdapter(HardwareAdapter):
    def set_power_limit(self, gpu_uuid: str, limit_w: int) -> None:
        handle = pynvml.nvmlDeviceGetHandleByUUID(gpu_uuid)
        lo_mw, hi_mw = pynvml.nvmlDeviceGetPowerManagementLimitConstraints(handle)
        limit_mw = max(lo_mw, min(hi_mw, limit_w * 1000))
        pynvml.nvmlDeviceSetPowerManagementLimit(handle, limit_mw)  # requires root
    # read_board_power -> DCGM field DCGM_FI_DEV_BOARD_POWER_WATTS via dcgm-exporter / DCGM API
    # read_ttft_p95_s  -> PromQL histogram_quantile(0.95, rate(vllm:time_to_first_token_seconds_bucket[1m]))`;

const MAPPING = [
  { fn: 'setPowerLimit()', api: 'nvmlDeviceSetPowerManagementLimit', note: 'NVML · milliwatts · root required · clamped to device constraints' },
  { fn: 'readBoardPower()', api: 'DCGM_FI_DEV_BOARD_POWER_WATTS', note: 'DCGM field (verify exact field ID against your DCGM version)' },
  { fn: 'readSla()', api: 'vllm:time_to_first_token_seconds', note: 'vLLM Prometheus histogram → TTFT p95 guardrail for decode' },
];

export default function HardwareAdapterDrawer() {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<'ts' | 'py'>('ts');
  const [copied, setCopied] = useState(false);
  const code = lang === 'ts' ? TS_SPEC : PY_SPEC;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-panel">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <Plug size={15} className="text-accent" />
          Hardware Interface & Future Adapter Spec
          <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            Phase 2
          </span>
        </span>
        <ChevronDown size={16} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <p className="text-xs leading-relaxed text-slate-400">
            This MVP is an offline brain: it never touches hardware. In Phase 2 the same allocator drives real racks through a thin adapter —
            read actual board power, apply per-group power limits, and guard latency SLAs with live TTFT telemetry.
          </p>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-xs">
              <thead className="bg-bg/60">
                <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 font-medium">Adapter method</th>
                  <th className="px-3 py-2 font-medium">Maps to</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {MAPPING.map((m) => (
                  <tr key={m.fn} className="border-t border-line/70">
                    <td className="px-3 py-2 font-mono text-slate-200">{m.fn}</td>
                    <td className="px-3 py-2 font-mono text-emerald">{m.api}</td>
                    <td className="px-3 py-2 text-slate-400">{m.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="w-56">
              <Segmented value={lang} onChange={setLang} options={[{ value: 'ts', label: 'TypeScript' }, { value: 'py', label: 'Python' }]} />
            </div>
            <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-600">
              {copied ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="max-h-[420px] overflow-auto rounded-lg border border-line bg-[#0A0F1C] p-4 text-[12px] leading-relaxed text-slate-300">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
