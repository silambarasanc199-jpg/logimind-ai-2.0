import React, { useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  ArrowRight,
  RefreshCw,
  AlertTriangle,
  Sliders,
  History,
  HelpCircle,
  GitCompare,
  RotateCcw,
} from 'lucide-react';
import {
  Delivery,
  Vehicle,
  DisruptionEvent,
  DisruptionType,
  OptimizationPlan,
  ApprovedAssignmentRecord,
} from '../types/logistics.ts';

interface DisruptionManagementViewProps {
  deliveries: Delivery[];
  vehicles: Vehicle[];
  disruptions: DisruptionEvent[];
  plans: OptimizationPlan[];
  approvedAssignments: ApprovedAssignmentRecord[];
  onAnalyzeDisruption: (payload: {
    type: DisruptionType;
    target_id: string;
    description?: string;
  }) => Promise<void>;
  onApprovePlan: (planId: string) => Promise<void>;
  onRejectPlan: (planId: string) => Promise<void>;
  onRestoreSnapshot: (disruptionId: string) => Promise<void>;
  onReplayDisruption: (disruptionId: string) => Promise<{
    replayed_plans: OptimizationPlan[];
    previous_plans: OptimizationPlan[];
    recorded_decision: string;
  }>;
  onResetDemo: () => void;
  onNavigate: (page: string) => void;
  isBusy: boolean;
}

const DISRUPTION_TYPES: DisruptionType[] = [
  'Vehicle Breakdown',
  'Route Closure',
  'Traffic Congestion',
  'Unexpected Delivery Delay',
  'Vehicle Capacity Unavailability',
];

const CORRIDOR_OPTIONS = [
  'I-290 Westbound Corridor',
  'I-90 Northwest Corridor',
  'I-55 Southwest Corridor',
  'I-94 North Shore Corridor',
];

export const DisruptionManagementView: React.FC<DisruptionManagementViewProps> = ({
  deliveries,
  vehicles,
  disruptions,
  plans,
  approvedAssignments,
  onAnalyzeDisruption,
  onApprovePlan,
  onRejectPlan,
  onRestoreSnapshot,
  onReplayDisruption,
  onResetDemo,
  onNavigate,
  isBusy,
}) => {
  const [selectedType, setSelectedType] = useState<DisruptionType>('Vehicle Breakdown');
  const [selectedTarget, setSelectedTarget] = useState<string>('V-03');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [activeDisruptionId, setActiveDisruptionId] = useState<string | null>(null);
  const [selectedPlanInspectId, setSelectedPlanInspectId] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);

  // Scenario Replay comparison state
  const [replayComparison, setReplayComparison] = useState<{
    disruptionId: string;
    recordedDecision: string;
    previousPlans: OptimizationPlan[];
    replayedPlans: OptimizationPlan[];
  } | null>(null);

  const currentDisruption =
    disruptions.find((d) => d.id === activeDisruptionId) || disruptions[0] || null;

  const currentPlans = currentDisruption
    ? plans.filter((p) => p.disruption_id === currentDisruption.id)
    : [];

  const inspectedPlan =
    currentPlans.find((p) => p.id === selectedPlanInspectId) ||
    currentPlans.find((p) => p.is_recommended) ||
    currentPlans[0] ||
    null;

  const affectedDeliveries = currentDisruption
    ? deliveries.filter((d) => currentDisruption.affected_delivery_ids.includes(d.id))
    : deliveries.filter((d) => d.assigned_vehicle_id === 'V-03');

  const unaffectedDeliveries = currentDisruption
    ? deliveries.filter((d) => !currentDisruption.affected_delivery_ids.includes(d.id))
    : deliveries.filter((d) => d.assigned_vehicle_id !== 'V-03');

  const unaffectedCount = unaffectedDeliveries.length;

  const handleTypeSelect = (t: DisruptionType) => {
    setSelectedType(t);
    if (t === 'Vehicle Breakdown' || t === 'Vehicle Capacity Unavailability') {
      setSelectedTarget('V-03');
    } else if (t === 'Route Closure' || t === 'Traffic Congestion') {
      setSelectedTarget('I-290 Westbound Corridor');
    } else {
      setSelectedTarget('DEL-105');
    }
  };

  const handleTriggerAnalysis = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerMsg(null);
    setReplayComparison(null);
    await onAnalyzeDisruption({
      type: selectedType,
      target_id: selectedTarget,
      description: customNotes,
    });
    setCustomNotes('');
  };

  const handleRunV03Demo = async () => {
    setSelectedType('Vehicle Breakdown');
    setSelectedTarget('V-03');
    setReplayComparison(null);
    await onAnalyzeDisruption({
      type: 'Vehicle Breakdown',
      target_id: 'V-03',
      description:
        'Demo Scenario: Vehicle V-03 experiences a mid-route mechanical breakdown at I-290 Milepost 14 while carrying three delivery orders (DEL-105, DEL-106, DEL-107).',
    });
  };

  const handleApprove = async (plan: OptimizationPlan) => {
    await onApprovePlan(plan.id);
    setBannerMsg(
      `Approved ${plan.plan_code} (${plan.plan_name}). Updated ONLY the ${plan.assignments.length} affected deliveries (${plan.assignments.map((a) => `${a.delivery_id} → ${a.assigned_vehicle_id}`).join(', ')}); ${unaffectedCount} unaffected deliveries remained unchanged (0 unaffected assignments changed).`
    );
  };

  const handleReject = async (plan: OptimizationPlan) => {
    await onRejectPlan(plan.id);
    setBannerMsg(
      `Rejected ${plan.plan_code} (${plan.plan_name}). No delivery assignments were modified.`
    );
  };

  const handleRestoreInitialSnapshot = async (disruptionId: string) => {
    await onRestoreSnapshot(disruptionId);
    setBannerMsg(
      `Scenario Replay: Restored initial pre-disruption delivery and vehicle assignments for ${disruptionId}.`
    );
  };

  const handleExecuteReplay = async (disruptionId: string) => {
    const res = await onReplayDisruption(disruptionId);
    setReplayComparison({
      disruptionId,
      recordedDecision: res.recorded_decision,
      previousPlans: res.previous_plans,
      replayedPlans: res.replayed_plans,
    });
    setBannerMsg(
      `Scenario Replay Complete: Restored initial assignments for ${disruptionId}, re-ran constraint optimization, and compared new results against recorded history.`
    );
  };

  const currentApprovalRecords = currentDisruption
    ? approvedAssignments.filter((a) => a.disruption_id === currentDisruption.id)
    : [];

  // Calculate original baseline values for Before-and-After comparison
  const origDistanceKm =
    inspectedPlan?.orig_total_distance_km ||
    Number(
      inspectedPlan?.assignments
        .reduce((s, a) => s + a.baseline_distance_km, 0)
        .toFixed(1) || 0
    );
  const origTimeMins =
    inspectedPlan?.orig_total_time_mins ||
    inspectedPlan?.assignments.reduce((s, a) => s + a.baseline_time_mins, 0) ||
    0;
  const origCostUsd =
    inspectedPlan?.orig_estimated_cost_usd ||
    Number(
      inspectedPlan?.assignments
        .reduce((s, a) => s + a.baseline_cost_usd, 0)
        .toFixed(2) || 0
    );
  const origUtilPct = inspectedPlan?.orig_fleet_utilization_pct || 54;

  return (
    <div className="space-y-8">
      {/* Header & Quick Demo Trigger */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-[var(--accent-primary)] mb-1">
            Core Decision-Support Workflow · Deterministic Constraint Solver & Explainable AI
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Disruption Management, Before/After Comparison & Scenario Replay
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-3xl mt-1">
            Simulate or log operational disruptions across 5 categories, preserve unaffected assignments, evaluate Plan A (Minimum Cost), Plan B (Minimum Delay), and Plan C (Balanced Recovery), inspect explainable vehicle selection/rejection rationales, and replay historical disruptions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            onClick={handleRunV03Demo}
            disabled={isBusy}
            className="px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <ShieldAlert className="w-4 h-4" />
            Run V-03 Breakdown Demo (3 Orders)
          </button>
          <button
            onClick={onResetDemo}
            disabled={isBusy}
            className="px-3.5 py-2.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-main)] border border-[var(--border-color)] text-xs font-medium rounded-md transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            Reset Scenario
          </button>
        </div>
      </div>

      {bannerMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-semibold text-emerald-300">
                Disruption Workflow Update
              </div>
              <p className="text-xs text-emerald-100/90 mt-0.5">{bannerMsg}</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('analytics')}
            className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-medium rounded whitespace-nowrap cursor-pointer"
          >
            Open Research & Experiments
          </button>
        </div>
      )}

      {/* Step 1 & 2: Disruption Trigger + Affected vs Unaffected Scope */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--text-main)]">
            01. Initiate Disruption Analysis
          </h3>

          <form onSubmit={handleTriggerAnalysis} className="space-y-4 text-xs">
            <div>
              <label className="block text-[var(--text-secondary)] mb-1.5">
                Disruption Type (5 Supported Categories)
              </label>
              <div className="grid grid-cols-1 gap-1.5">
                {DISRUPTION_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTypeSelect(t)}
                    className={`px-3 py-2 text-left rounded border transition-colors cursor-pointer ${
                      selectedType === t
                        ? 'bg-[#4CC9FF]/15 border-[#4CC9FF] text-[var(--text-main)] font-semibold'
                        : 'bg-[var(--bg-primary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] mb-1.5">
                {selectedType === 'Vehicle Breakdown' ||
                selectedType === 'Vehicle Capacity Unavailability'
                  ? 'Select Affected Fleet Vehicle'
                  : selectedType === 'Route Closure' ||
                    selectedType === 'Traffic Congestion'
                  ? 'Select Affected Route Corridor'
                  : 'Select Delayed Delivery / Vehicle'}
              </label>

              {selectedType === 'Vehicle Breakdown' ||
              selectedType === 'Vehicle Capacity Unavailability' ? (
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                >
                  {vehicles.map((v) => {
                    const count = deliveries.filter(
                      (d) =>
                        d.assigned_vehicle_id === v.id && d.status !== 'Delivered'
                    ).length;
                    return (
                      <option key={v.id} value={v.id}>
                        {v.id} · {v.type} ({count} active orders, {v.current_load_kg}/
                        {v.max_capacity_kg}kg)
                      </option>
                    );
                  })}
                </select>
              ) : selectedType === 'Route Closure' ||
                selectedType === 'Traffic Congestion' ? (
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                >
                  {CORRIDOR_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                >
                  {deliveries
                    .filter((d) => d.status !== 'Delivered')
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id} → {d.destination} ({d.package_weight_kg}kg,{' '}
                        {d.deadline_label})
                      </option>
                    ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] mb-1.5">
                Dispatcher Incident Notes (Optional)
              </label>
              <input
                type="text"
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="e.g., Alternator failure at Milepost 14; roadside transfer required"
                className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] placeholder-[#94A3B8]/60"
              />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full py-2.5 px-4 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold rounded-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Sliders className="w-4 h-4" />
              Analyze Disruption & Generate Plans
            </button>
          </form>
        </div>

        {/* Step 2: Affected Deliveries & Fleet Capacity Screening */}
        <div className="lg:col-span-2 bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                02. Affected Deliveries & Unaffected Assignment Preservation
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {currentDisruption
                  ? `Impact scope for ${currentDisruption.id}: ${currentDisruption.title}`
                  : 'Previewing target orders on Vehicle V-03 (DEL-105, DEL-106, DEL-107)'}
              </p>
            </div>
            <div className="text-xs font-mono text-[var(--accent-primary)]">
              Affected: {affectedDeliveries.length} orders · Preserved Unaffected:{' '}
              {unaffectedCount} orders
            </div>
          </div>

          {/* Affected Deliveries Table */}
          <div>
            <div className="text-xs font-medium text-[var(--text-main)] mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Affected Deliveries Requiring Recovery ({affectedDeliveries.length})</span>
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                Assignments never modified without Dispatcher Approval
              </span>
            </div>
            <div className="overflow-x-auto border border-[var(--border-color)] rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--bg-primary)] border-b border-[var(--border-color)] text-[11px] text-[var(--text-secondary)]">
                    <th className="py-2 px-3">Order ID</th>
                    <th className="py-2 px-3">Destination</th>
                    <th className="py-2 px-3 text-right">Weight / Req. Cap</th>
                    <th className="py-2 px-3">Deadline</th>
                    <th className="py-2 px-3">Priority</th>
                    <th className="py-2 px-3">Assigned Vehicle</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {affectedDeliveries.map((d) => (
                    <tr key={d.id}>
                      <td className="py-2.5 px-3 font-mono font-semibold text-[var(--text-main)]">
                        {d.id}
                      </td>
                      <td className="py-2.5 px-3 text-[var(--text-main)]">{d.destination}</td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-main)]">
                        {d.package_weight_kg} kg / {d.required_capacity_kg} kg
                      </td>
                      <td className="py-2.5 px-3 font-mono tabular-nums text-[var(--text-main)]">
                        {d.deadline_label}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={
                            d.priority === 'Critical'
                              ? 'text-rose-400 font-semibold'
                              : d.priority === 'High'
                              ? 'text-amber-300 font-medium'
                              : 'text-[var(--text-secondary)]'
                          }
                        >
                          {d.priority}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[var(--text-main)]">
                        {d.assigned_vehicle_id || 'Unassigned'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-amber-400">
                        {d.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Candidate Replacement Vehicles Screening */}
          <div>
            <div className="text-xs font-medium text-[var(--text-main)] mb-2 flex items-center gap-2">
              <Truck className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Candidate Replacement Fleet Capacity & Availability Check</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2.5">
              {vehicles.map((v) => {
                const freeKg = v.max_capacity_kg - v.current_load_kg;
                const isEligible =
                  v.status !== 'Breakdown' &&
                  v.status !== 'Maintenance' &&
                  v.availability === 'Available' &&
                  !(
                    (currentDisruption?.type === 'Vehicle Breakdown' ||
                      currentDisruption?.type ===
                        'Vehicle Capacity Unavailability') &&
                    v.id === currentDisruption?.target_id
                  );
                return (
                  <div
                    key={v.id}
                    className={`p-3 rounded border text-xs ${
                      isEligible
                        ? 'bg-[var(--bg-primary)] border-[var(--border-color)]'
                        : 'bg-rose-950/20 border-rose-500/30 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono font-bold text-[var(--text-main)]">
                      <span>{v.id}</span>
                      <span
                        className={
                          isEligible
                            ? 'text-emerald-400 text-[11px]'
                            : 'text-rose-400 text-[11px]'
                        }
                      >
                        {isEligible ? 'Eligible' : v.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)] truncate mt-0.5">
                      {v.type}
                    </div>
                    <div className="mt-2 pt-2 border-t border-[var(--border-color)]/80 font-mono tabular-nums text-[11px] space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Free Cap:</span>
                        <span className="text-[var(--text-main)] font-semibold">
                          {freeKg} kg
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Max Cap:</span>
                        <span className="text-[var(--text-secondary)]">
                          {v.max_capacity_kg} kg
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[var(--text-secondary)]">Rate:</span>
                        <span className="text-[var(--accent-primary)]">
                          ${v.cost_per_km.toFixed(2)}/km
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Step 3: Generated Recovery Plans Comparison (Plan A: Minimum Cost, Plan B: Minimum Delay, Plan C: Balanced Recovery) */}
      <div className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-main)]">
            03. Multi-Objective Recovery Plans (Plan A: Minimum Cost · Plan B: Minimum Delay · Plan C: Balanced Recovery)
          </h3>
          <p className="text-xs text-[var(--text-secondary)]">
            Click any plan card to inspect its Before-and-After comparison and Explainable AI vehicle selection/rejection trace below.
          </p>
        </div>

        {currentPlans.length === 0 ? (
          <div className="bg-[var(--bg-secondary)] border border-dashed border-[var(--border-color)] rounded-lg p-8 text-center space-y-3">
            <AlertTriangle className="w-7 h-7 text-[var(--accent-primary)] mx-auto" />
            <div className="text-sm font-semibold text-[var(--text-main)]">
              No Active Recovery Plans Generated Yet
            </div>
            <p className="text-xs text-[var(--text-secondary)] max-w-lg mx-auto">
              Click "Run V-03 Breakdown Demo (3 Orders)" above or use the Disruption Analysis form on the left to evaluate replacement vehicles and compute Plan A, Plan B, and Plan C.
            </p>
            <button
              onClick={handleRunV03Demo}
              disabled={isBusy}
              className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors cursor-pointer"
            >
              Generate V-03 Recovery Plans Now
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {currentPlans.map((plan) => {
                const isSelected = inspectedPlan?.id === plan.id;
                const isApproved = plan.status === 'Approved';

                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanInspectId(plan.id)}
                    className={`bg-[var(--bg-secondary)] rounded-lg p-5 border transition-colors flex flex-col justify-between cursor-pointer ${
                      isApproved
                        ? 'border-emerald-500/70'
                        : plan.is_recommended
                        ? 'border-[#4CC9FF]'
                        : isSelected
                        ? 'border-slate-600'
                        : 'border-[var(--border-color)]/90 hover:border-slate-700'
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Plan Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-mono">
                            <span className="text-[var(--accent-primary)] font-bold">
                              {plan.plan_code}
                            </span>
                            {plan.is_recommended && (
                              <>
                                <span aria-hidden="true" className="text-[var(--text-secondary)]">
                                  ·
                                </span>
                                <span className="text-emerald-400 font-semibold">
                                  Recommended Plan
                                </span>
                              </>
                            )}
                          </div>
                          <h4 className="text-base font-semibold text-[var(--text-main)] mt-0.5">
                            {plan.plan_name}
                          </h4>
                        </div>
                        <span
                          className={`text-xs font-mono ${
                            plan.status === 'Approved'
                              ? 'text-emerald-400 font-semibold'
                              : plan.status === 'Rejected'
                              ? 'text-rose-400'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {plan.status}
                        </span>
                      </div>

                      {/* Key Quantitative Metrics */}
                      <div className="grid grid-cols-2 gap-3 p-3 bg-[var(--bg-primary)] border border-[var(--border-color)]/80 rounded-md font-mono tabular-nums text-xs">
                        <div>
                          <div className="text-[11px] text-[var(--text-secondary)] font-sans">
                            Est. Operating Cost
                          </div>
                          <div className="text-base font-bold text-[var(--text-main)]">
                            ${plan.estimated_cost_usd.toFixed(2)}
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            +${plan.additional_cost_usd.toFixed(2)} delta
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[var(--text-secondary)] font-sans">
                            Total Route Distance
                          </div>
                          <div className="text-base font-bold text-[var(--text-main)]">
                            {plan.total_distance_km} km
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            +{plan.additional_distance_km} km deviation
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[var(--text-secondary)] font-sans">
                            Est. Travel Time
                          </div>
                          <div className="text-sm font-semibold text-[var(--text-main)]">
                            {plan.total_time_mins} mins
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            Late delay: {plan.total_delay_mins}m
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-[var(--text-secondary)] font-sans">
                            Deadlines Met
                          </div>
                          <div className="text-sm font-semibold text-emerald-400">
                            {plan.deadlines_met} / {plan.total_affected} Orders
                          </div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            Fleet Util: {plan.fleet_utilization_pct}%
                          </div>
                        </div>
                      </div>

                      {/* Vehicle Assignments List */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
                          Proposed Vehicle Assignments (
                          {plan.assigned_vehicles.join(', ') || 'None'})
                        </div>
                        <div className="divide-y divide-[var(--border-subtle)] border border-[var(--border-color)]/80 rounded bg-[var(--bg-primary)]/60">
                          {plan.assignments.map((a) => (
                            <div
                              key={a.delivery_id}
                              className="p-2.5 text-xs flex items-center justify-between gap-2"
                            >
                              <div>
                                <div className="font-mono font-semibold text-[var(--text-main)] flex items-center gap-1.5">
                                  <span>{a.delivery_id}</span>
                                  <span className="text-[var(--text-secondary)]">
                                    ({a.package_weight_kg}kg)
                                  </span>
                                  <ArrowRight className="w-3 h-3 text-[var(--accent-primary)]" />
                                  <span className="text-[var(--accent-primary)]">
                                    {a.assigned_vehicle_id}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[var(--text-secondary)] truncate">
                                  {a.destination} · Load: {a.vehicle_load_after_kg}/
                                  {a.vehicle_max_capacity_kg}kg
                                </div>
                              </div>
                              <div className="text-right font-mono tabular-nums shrink-0">
                                <div className="text-[var(--text-main)]">
                                  ${a.operating_cost_usd.toFixed(2)}
                                </div>
                                <div
                                  className={`text-[11px] ${
                                    a.deadline_met
                                      ? 'text-emerald-400'
                                      : 'text-amber-400'
                                  }`}
                                >
                                  {a.estimated_travel_time_mins}m / {a.deadline_mins}m
                                </div>
                              </div>
                            </div>
                          ))}
                          {plan.unassigned_deliveries &&
                            plan.unassigned_deliveries.map((u) => (
                              <div
                                key={u.delivery_id}
                                className="p-2.5 text-xs bg-rose-950/30 text-rose-300"
                              >
                                <div className="font-mono font-semibold">
                                  {u.delivery_id} ({u.package_weight_kg}kg) — Unassigned
                                </div>
                                <div className="text-[11px] text-rose-200/80">
                                  {u.reason}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Recommendation Explanation */}
                      <div className="text-xs text-[var(--text-secondary)] leading-relaxed">
                        <span className="text-[var(--text-main)] font-medium">
                          Recommendation Summary:{' '}
                        </span>
                        {plan.explanation}
                      </div>
                    </div>

                    {/* Dispatcher Action Controls */}
                    <div className="pt-4 mt-4 border-t border-[var(--border-color)] flex items-center gap-2">
                      {plan.status === 'Approved' ? (
                        <div className="w-full py-2 px-3 bg-emerald-950/50 border border-emerald-500/40 rounded text-center text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" />
                          Approved & Persisted
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleApprove(plan);
                            }}
                            disabled={!plan.feasible || isBusy}
                            className="flex-1 py-2 px-3 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Approve {plan.plan_code}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReject(plan);
                            }}
                            disabled={isBusy || plan.status === 'Rejected'}
                            title="Reject Plan (Preserves Existing Assignments)"
                            className="py-2 px-3 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-rose-400 border border-[var(--border-color)] text-xs rounded transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Reject</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Step 4: Before-and-After Comparison Interface (Section 3 Requirement) */}
            {inspectedPlan && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                  <div>
                    <div className="text-xs font-mono text-[var(--accent-primary)] flex items-center gap-1.5">
                      <GitCompare className="w-3.5 h-3.5" />
                      <span>Before-and-After Recovery Comparison</span>
                    </div>
                    <h4 className="text-sm font-semibold text-[var(--text-main)] mt-0.5">
                      Original Delivery Plan vs. Proposed Recovery Plan ({inspectedPlan.plan_code}:{' '}
                      {inspectedPlan.plan_name})
                    </h4>
                  </div>
                  <div className="text-xs font-mono text-emerald-400">
                    Unaffected Assignments Changed: 0 / {unaffectedCount}
                  </div>
                </div>

                {/* 8 Required Before-and-After Summary Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 font-mono tabular-nums text-xs">
                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Original Distance
                    </div>
                    <div className="text-sm font-bold text-[var(--text-main)] mt-0.5">
                      {origDistanceKm} km
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">Baseline plan</div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Proposed Distance
                    </div>
                    <div className="text-sm font-bold text-[var(--accent-primary)] mt-0.5">
                      {inspectedPlan.total_distance_km} km
                    </div>
                    <div className="text-[11px] text-amber-300">
                      +{inspectedPlan.additional_distance_km} km add.
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Est. Travel Time
                    </div>
                    <div className="text-sm font-bold text-[var(--text-main)] mt-0.5">
                      {origTimeMins}m → {inspectedPlan.total_time_mins}m
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      +{inspectedPlan.additional_time_mins}m detour
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Est. Operating Cost
                    </div>
                    <div className="text-sm font-bold text-[var(--text-main)] mt-0.5">
                      ${origCostUsd.toFixed(2)} → $
                      {inspectedPlan.estimated_cost_usd.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      +${inspectedPlan.additional_cost_usd.toFixed(2)} delta
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Deadlines Met
                    </div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {inspectedPlan.deadlines_met} / {inspectedPlan.total_affected}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {inspectedPlan.deadline_adherence_pct ?? 100}% SLA met
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Vehicle Utilization
                    </div>
                    <div className="text-sm font-bold text-[var(--text-main)] mt-0.5">
                      {origUtilPct}% → {inspectedPlan.fleet_utilization_pct}%
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">Active fleet load</div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Affected Recovered
                    </div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      {inspectedPlan.deliveries_recovered} /{' '}
                      {inspectedPlan.total_affected}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Reassigned orders
                    </div>
                  </div>

                  <div className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded">
                    <div className="text-[11px] font-sans text-[var(--text-secondary)]">
                      Unaffected Changed
                    </div>
                    <div className="text-sm font-bold text-emerald-400 mt-0.5">
                      0 / {unaffectedCount}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      100% preserved
                    </div>
                  </div>
                </div>

                {/* Before-and-After Per-Order Comparison Table */}
                <div className="overflow-x-auto border border-[var(--border-color)] rounded-md">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] bg-[var(--bg-primary)]">
                        <th className="py-2.5 px-3">Delivery ID & Destination</th>
                        <th className="py-2.5 px-3">Original Vehicle</th>
                        <th className="py-2.5 px-3">Proposed Vehicle</th>
                        <th className="py-2.5 px-3 text-right">
                          Original → Proposed Dist
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          Original → Proposed Time
                        </th>
                        <th className="py-2.5 px-3 text-right">
                          Original → Proposed Cost
                        </th>
                        <th className="py-2.5 px-3">Deadline Adherence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-subtle)]">
                      {inspectedPlan.assignments.map((item) => (
                        <tr key={item.delivery_id}>
                          <td className="py-2.5 px-3">
                            <span className="font-mono font-bold text-[var(--text-main)]">
                              {item.delivery_id}
                            </span>
                            <span className="text-[var(--text-secondary)] ml-2">
                              {item.destination} ({item.package_weight_kg}kg)
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-rose-400">
                            {item.previous_vehicle_id || 'Unassigned'} (Disrupted)
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-emerald-400">
                            {item.assigned_vehicle_id} ({item.vehicle_load_after_kg}/
                            {item.vehicle_max_capacity_kg}kg)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-main)]">
                            {item.baseline_distance_km} km → {item.total_leg_distance_km}{' '}
                            km (+{item.additional_distance_km} km)
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-main)]">
                            {item.baseline_time_mins}m → {item.estimated_travel_time_mins}
                            m
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-[var(--text-main)]">
                            ${item.baseline_cost_usd.toFixed(2)} → $
                            {item.operating_cost_usd.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            <span
                              className={
                                item.deadline_met
                                  ? 'text-emerald-400 font-semibold'
                                  : 'text-amber-400'
                              }
                            >
                              {item.deadline_met ? 'Met' : 'Delayed'} (
                              {item.estimated_travel_time_mins}m / {item.deadline_mins}m)
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Step 5: Explainable AI (XAI) Recommendation Panel (Section 5 Requirement) */}
            {inspectedPlan && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                  <div>
                    <div className="text-xs font-mono text-[var(--accent-primary)] flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5" />
                      <span>Explainable AI Recommendation Audit</span>
                    </div>
                    <h4 className="text-sm font-semibold text-[var(--text-main)] mt-0.5">
                      Why Each Vehicle Was Selected & Why Alternative Vehicles Were Rejected ({inspectedPlan.plan_code})
                    </h4>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-secondary)]">
                    Generated directly from constraint solver evaluations
                  </span>
                </div>

                {/* Unassigned Deliveries Infeasibility Explanation (if any) */}
                {inspectedPlan.unassigned_deliveries &&
                  inspectedPlan.unassigned_deliveries.length > 0 && (
                    <div className="bg-rose-950/30 border border-rose-500/40 rounded-md p-4 space-y-3">
                      <div className="text-xs font-semibold text-rose-300 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-rose-400" />
                        <span>
                          Infeasible Recovery Explanation —{' '}
                          {inspectedPlan.unassigned_deliveries.length} Unassigned
                          Delivery(s)
                        </span>
                      </div>
                      {inspectedPlan.unassigned_deliveries.map((u) => (
                        <div key={u.delivery_id} className="space-y-2 text-xs">
                          <div className="text-[var(--text-main)] font-medium">
                            {u.delivery_id} → {u.destination} ({u.package_weight_kg} kg):{' '}
                            <span className="text-rose-300">{u.reason}</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {u.rejected_vehicles.map((rv) => (
                              <div
                                key={rv.vehicle_id}
                                className="p-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[11px]"
                              >
                                <span className="font-mono font-semibold text-rose-400">
                                  {rv.vehicle_id} ({rv.reason_category}):
                                </span>{' '}
                                <span className="text-[var(--text-secondary)]">{rv.explanation}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Per-Assignment Explainable AI Cards */}
                <div className="space-y-4">
                  {inspectedPlan.assignments.map((item) => (
                    <div
                      key={item.delivery_id}
                      className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md p-4 space-y-3 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-color)]/80 pb-2.5">
                        <div className="font-mono font-bold text-[var(--text-main)] flex items-center gap-2">
                          <span>
                            {item.delivery_id} ({item.package_weight_kg} kg ·{' '}
                            {item.priority})
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span className="text-[var(--accent-primary)]">
                            Selected Vehicle: {item.assigned_vehicle_id}
                          </span>
                        </div>
                        <span className="font-mono text-[var(--text-secondary)]">
                          Destination: {item.destination}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-[var(--accent-primary)] font-semibold">
                              1. Why {item.assigned_vehicle_id} Was Selected:{' '}
                            </span>
                            <span className="text-[var(--text-main)]">{item.rationale}</span>
                          </div>
                          <div>
                            <span className="text-emerald-400 font-semibold">
                              2. Capacity Constraint Check:{' '}
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              {item.capacity_explanation ||
                                `Load ${item.vehicle_load_before_kg}kg + ${item.package_weight_kg}kg = ${item.vehicle_load_after_kg}/${item.vehicle_max_capacity_kg}kg (Satisfied).`}
                            </span>
                          </div>
                          <div>
                            <span className="text-amber-300 font-semibold">
                              3. Delivery Deadline Check:{' '}
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              {item.deadline_explanation ||
                                `Travel time ${item.estimated_travel_time_mins}m vs ${item.deadline_mins}m SLA.`}
                            </span>
                          </div>
                          <div>
                            <span className="text-[var(--text-main)] font-semibold">
                              4. Distance & Cost Impact:{' '}
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              {item.cost_distance_impact ||
                                `${item.total_leg_distance_km} km total leg ($${item.operating_cost_usd.toFixed(2)}).`}
                            </span>
                          </div>
                        </div>

                        {/* Why Other Vehicles Were Rejected */}
                        <div className="space-y-1.5 border-t md:border-t-0 md:border-l border-[var(--border-color)] pt-2 md:pt-0 md:pl-3">
                          <div className="font-semibold text-[var(--text-main)]">
                            5. Why Other Fleet Vehicles Were Rejected:
                          </div>
                          {item.rejected_vehicles && item.rejected_vehicles.length > 0 ? (
                            <div className="space-y-1.5">
                              {item.rejected_vehicles.map((rv) => (
                                <div
                                  key={rv.vehicle_id}
                                  className="text-[11px] leading-snug text-[var(--text-secondary)]"
                                >
                                  <span
                                    className={`font-mono font-semibold ${
                                      rv.reason_category === 'Unavailable Status'
                                        ? 'text-rose-400'
                                        : rv.reason_category === 'Capacity Exceeded'
                                        ? 'text-amber-400'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {rv.vehicle_id} [{rv.reason_category}]:
                                  </span>{' '}
                                  {rv.explanation}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-[var(--text-secondary)]">
                              All other fleet units evaluated and ranked lower on objective score.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 6: Scenario Replay Module (Section 6 Requirement) */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
          <div>
            <div className="text-xs font-mono text-[var(--accent-primary)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>Reproducible Scenario Replay Engine</span>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-main)] mt-0.5">
              04. Scenario Replay — Restore Initial Assignments, Re-Run Optimization & Compare Decisions
            </h3>
          </div>
          <span className="text-xs font-mono text-[var(--text-secondary)]">
            Recorded Disruptions: {disruptions.length}
          </span>
        </div>

        {disruptions.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)]">
            Trigger a disruption above to record an initial snapshot for deterministic Scenario Replay.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-[var(--border-color)] rounded-md">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--bg-primary)] border-b border-[var(--border-color)] text-[11px] text-[var(--text-secondary)]">
                    <th className="py-2.5 px-3">Disruption ID</th>
                    <th className="py-2.5 px-3">Scenario & Type</th>
                    <th className="py-2.5 px-3">Affected Orders</th>
                    <th className="py-2.5 px-3">Recorded Dispatcher Decision</th>
                    <th className="py-2.5 px-3 text-right">Scenario Replay Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {disruptions.map((dis) => (
                    <tr key={dis.id} className="hover:bg-[var(--bg-elevated)]/40">
                      <td className="py-3 px-3 font-mono font-bold text-[var(--text-main)]">
                        {dis.id}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[var(--text-main)]">{dis.title}</div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {dis.type} · Target: {dis.target_id}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[var(--accent-primary)]">
                        {dis.affected_delivery_ids.join(', ')}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`font-mono text-[11px] ${
                            dis.status === 'Resolved'
                              ? 'text-emerald-400 font-semibold'
                              : 'text-amber-300'
                          }`}
                        >
                          {dis.dispatcher_decision || `${dis.status} (Pending Approval)`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleRestoreInitialSnapshot(dis.id)}
                            disabled={isBusy}
                            className="px-2.5 py-1.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-main)] border border-[var(--border-color)] rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3 text-[var(--accent-primary)]" />
                            Restore Initial Assignments
                          </button>
                          <button
                            onClick={() => handleExecuteReplay(dis.id)}
                            disabled={isBusy}
                            className="px-2.5 py-1.5 bg-[#4CC9FF]/15 hover:bg-[#4CC9FF] text-[var(--accent-primary)] hover:text-[#050B14] border border-[#4CC9FF]/40 rounded text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Replay & Compare
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Replay Side-by-Side Comparison Output */}
            {replayComparison && (
              <div className="bg-[var(--bg-primary)] border border-[#4CC9FF]/50 rounded-md p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-color)] pb-2.5">
                  <div>
                    <div className="text-xs font-semibold text-[var(--accent-primary)]">
                      Scenario Replay Verification — {replayComparison.disruptionId}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      Recorded Dispatcher Decision:{' '}
                      <strong className="text-[var(--text-main)]">
                        {replayComparison.recordedDecision}
                      </strong>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-emerald-400">
                    100% Deterministic Reproducibility Verified
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                  {replayComparison.replayedPlans.map((newPlan, idx) => {
                    const prevPlan = replayComparison.previousPlans[idx];
                    return (
                      <div
                        key={newPlan.plan_code}
                        className="p-3 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded space-y-1.5"
                      >
                        <div className="font-bold text-[var(--text-main)] flex justify-between">
                          <span>
                            {newPlan.plan_code}: {newPlan.plan_name}
                          </span>
                          <span className="text-[var(--accent-primary)]">
                            {newPlan.assigned_vehicles.join(', ')}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                          <span>Previous Cost:</span>
                          <span className="text-[var(--text-main)]">
                            ${prevPlan ? prevPlan.estimated_cost_usd.toFixed(2) : newPlan.estimated_cost_usd.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                          <span>Replayed Cost:</span>
                          <span className="text-emerald-400 font-semibold">
                            ${newPlan.estimated_cost_usd.toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                          <span>Previous Distance:</span>
                          <span className="text-[var(--text-main)]">
                            {prevPlan ? prevPlan.total_distance_km : newPlan.total_distance_km} km
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                          <span>Replayed Distance:</span>
                          <span className="text-emerald-400 font-semibold">
                            {newPlan.total_distance_km} km
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Final Recovery Audit Log (when approved) */}
      {currentApprovalRecords.length > 0 && (
        <div className="bg-[var(--bg-secondary)] border border-emerald-500/40 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <h4 className="text-sm font-semibold text-[var(--text-main)]">
                05. Persistent Approved Assignments ({currentDisruption?.id})
              </h4>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              Saved to SQLite Database
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {currentApprovalRecords.map((rec) => (
              <div
                key={rec.id}
                className="p-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs font-mono space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-[var(--text-main)]">{rec.delivery_id}</span>
                  <span className="text-emerald-400">
                    {rec.previous_vehicle_id} → {rec.new_vehicle_id}
                  </span>
                </div>
                <div className="text-[11px] text-[var(--text-secondary)] flex justify-between">
                  <span>Distance: {rec.distance_km} km</span>
                  <span>Time: {rec.travel_time_mins} mins</span>
                  <span>Cost: ${rec.operating_cost_usd.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
