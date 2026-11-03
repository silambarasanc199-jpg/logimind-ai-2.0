import React, { useState } from 'react';
import {
  Save,
  RefreshCw,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { AppSettings } from '../types/logistics.ts';

interface SettingsViewProps {
  settings: AppSettings;
  onSaveSettings: (newSettings: AppSettings) => Promise<void>;
  onResetDemo: () => Promise<void>;
  isBusy: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSaveSettings,
  onResetDemo,
  isBusy,
}) => {
  const [formState, setFormState] = useState<AppSettings>(settings);
  const [savedBanner, setSavedBanner] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings(formState);
    setSavedBanner(true);
    setTimeout(() => setSavedBanner(false), 3000);
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-main)]">
          System & Optimization Engine Settings
        </h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Configure constraint solver parameters, road network tortuosity factors, handover durations, and SQLite dataset controls.
        </p>
      </div>

      {savedBanner && (
        <div className="bg-emerald-500/15 border border-emerald-500/40 rounded-md p-3.5 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Optimization parameters saved to persistent SQLite storage.</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6 space-y-6 text-xs"
      >
        <div className="border-b border-[var(--border-color)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            Heuristic Solver & Distance Calculation Parameters
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            These parameters directly govern route distance estimation and travel-time calculations during disruption analysis.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              Active Dataset Label
            </label>
            <input
              type="text"
              value={formState.dataset_label}
              onChange={(e) =>
                setFormState({ ...formState, dataset_label: e.target.value })
              }
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              Urban Road Tortuosity Factor (Haversine Multiplier)
            </label>
            <input
              type="number"
              step="0.02"
              min={1.0}
              max={2.0}
              value={formState.road_tortuosity_factor}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  road_tortuosity_factor: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              Roadside Transfer & Handover Time (mins)
            </label>
            <input
              type="number"
              min={0}
              max={60}
              value={formState.transfer_handover_mins}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  transfer_handover_mins: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
            />
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] mb-1">
              SLA Delay Penalty Weight ($ / min late)
            </label>
            <input
              type="number"
              step="0.25"
              min={0.5}
              max={20}
              value={formState.delay_penalty_per_min_usd}
              onChange={(e) =>
                setFormState({
                  ...formState,
                  delay_penalty_per_min_usd: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-[var(--border-color)] flex items-center justify-between">
          <div className="text-[var(--text-secondary)]">
            Hard Capacity & Availability Constraints:{' '}
            <strong className="text-emerald-600 dark:text-emerald-400">
              Always Enforced
            </strong>
          </div>
          <button
            type="submit"
            disabled={isBusy}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold rounded-md flex items-center gap-2 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            Save Solver Configuration
          </button>
        </div>
      </form>

      {/* Deterministic Demo Reset Card */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-main)]">
            <Database className="w-4 h-4 text-[var(--accent-primary)]" />
            <span>Restore Deterministic Hackathon Demo Scenario</span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] max-w-xl">
            Resets SQLite tables to the initial baseline: 10 delivery orders (DEL-101 to DEL-110), 5 vehicles (V-01 to V-05), with V-03 carrying three active orders (DEL-105, DEL-106, DEL-107) ready for breakdown recovery demonstration.
          </p>
        </div>
        <button
          onClick={onResetDemo}
          disabled={isBusy}
          className="px-4 py-2.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[var(--text-main)] text-xs font-semibold rounded-md flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <RefreshCw className="w-4 h-4 text-[var(--accent-primary)]" />
          Reset SQLite Demo Dataset
        </button>
      </div>
    </div>
  );
};
