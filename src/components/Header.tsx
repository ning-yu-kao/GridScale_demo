import { Bolt, ShieldCheck } from 'lucide-react';
import { SCENARIO_PRESETS } from '../data/publicProfiles';

export default function Header({ presetId, onPreset }: { presetId: string | null; onPreset: (id: string) => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-6 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-emerald text-white shadow-lg shadow-accent/20">
            <Bolt size={20} strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-slate-50 sm:text-base">
              GridScale <span className="text-slate-500">—</span> Workload-Aware AI Cluster Power Simulator{' '}
              <span className="text-slate-400">(MVP)</span>
            </h1>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-2 py-0.5 text-[11px] font-medium text-emerald">
              <ShieldCheck size={12} />
              Public Data-Driven Offline Simulator | Zero Unverified Hardware Claims
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SCENARIO_PRESETS.map((p) => {
            const active = p.id === presetId;
            return (
              <button
                key={p.id}
                onClick={() => onPreset(p.id)}
                title={p.tagline}
                className={`group rounded-lg border px-3 py-1.5 text-left transition ${
                  active ? 'border-accent bg-accent/15 shadow-[0_0_0_1px_rgba(59,130,246,0.4)]' : 'border-line bg-panel hover:border-slate-600'
                }`}
              >
                <div className={`text-xs font-semibold ${active ? 'text-slate-50' : 'text-slate-200'}`}>{p.name}</div>
                <div className="text-[10px] text-slate-500">{p.tagline}</div>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
