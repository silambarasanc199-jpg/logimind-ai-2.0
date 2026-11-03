import React, { useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Cpu,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import {
  Delivery,
  Vehicle,
  OptimizationPlan,
  DisruptionEvent,
  AppSettings,
} from '../types/logistics.ts';

interface OptimizationCenterViewProps {
  deliveries: Delivery[];
  vehicles: Vehicle[];
  plans: OptimizationPlan[];
  disruptions: DisruptionEvent[];
  settings: AppSettings;
  onApprovePlan: (planId: string) => Promise<void>;
  onTriggerV03Demo: () => Promise<void>;
  isBusy: boolean;
}

export const OptimizationCenterView: React.FC<OptimizationCenterViewProps> = ({
  deliveries,
  vehicles,
  plans,
  disruptions,
  settings,
  onApprovePlan,
  onTriggerV03Demo,
  isBusy,
}) => {
  const [selectedDisruptionId, setSelectedDisruptionId] = useState<string>(
    disruptions[0]?.id || ''
  );
  const [inspectPlanId, setInspectPlanId] = useState<string | null>(null);

  const activeDisruption =
    disruptions.find((d) => d.id === selectedDisruptionId) ||
    disruptions[0] ||
    null;

  const activePlans = activeDisruption
    ? plans.filter((p) => p.disruption_id === activeDisruption.id)
    : plans.slice(0, 3);

  const inspectedPlan =
    activePlans.find((p) => p.id === inspectPlanId) ||
    activePlans.find((p) => p.is_recommended) ||
    activePlans[0] ||
    null;

  const comparisonChartData = activePlans.map((p) => ({
    plan: `${p.plan_code}: ${p.plan_name}`,
    costUsd: p.estimated_cost_usd,
    distanceKm: p.total_distance_km,
    timeMins: p.total_time_mins,
    utilizationPct: p.fleet_utilization_pct,
  }));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-[var(--accent-primary)] mb-1">
            Constraint-Aware Multi-Objective Heuristic Engine
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            AI Optimization Center — Plan A (Minimum Cost), Plan B (Minimum Delay) & Plan C (Balanced Recovery)
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-3xl mt-1">
            Evaluates vehicle capacity, availability, delivery deadlines, priority, route distance, travel time, operating cost, and route deviation to compute explainable recovery plans.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {disruptions.length > 0 && (
            <select
              value={activeDisruption?.id || ''}
              onChange={(e) => setSelectedDisruptionId(e.target.value)}
              aria-label="Select disruption batch"
              className="px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs font-mono text-[var(--text-main)]"
            >
              {disruptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.id} — {d.title} ({d.status})
                </option>
              ))}
            </select>
          )}
          <button
            onClick={onTriggerV03Demo}
            disabled={isBusy}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Cpu className="w-4 h-4" />
            Compute V-03 Optimization Plans
          </button>
        </div>
      </div>

      {/* Algorithm Specification & Active Constraints Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Hard Capacity Constraint</div>
          <div className="text-sm font-semibold font-mono text-[var(--text-main)]">
            Load + Pkg ≤ Max Cap
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Never assigns a vehicle whose remaining payload or rated capacity is insufficient.
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Availability Filter</div>
          <div className="text-sm font-semibold font-mono text-[var(--text-main)]">
            Status != Breakdown / Maint
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Automatically excludes offline, maintenance, or broken-down vehicles from candidate pool.
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Distance & Route Deviation</div>
          <div className="text-sm font-semibold font-mono text-[var(--text-main)]">
            Haversine × {settings.road_tortuosity_factor}x Road
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Includes deadhead pickup leg + delivery leg + {settings.transfer_handover_mins}m handover.
          </p>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-4">
          <div className="text-xs text-[var(--text-secondary)] mb-1">Unaffected Preservation</div>
          <div className="text-sm font-semibold font-mono text-emerald-400">
            0 Unaffected Changed
          </div>
          <p className="text-[11px] text-[var(--text-secondary)] mt-1">
            Only affected deliveries are reassigned upon dispatcher approval.
          </p>
        </div>
      </div>

      {activePlans.length === 0 ? (
        <div className="bg-[var(--bg-secondary)] border border-dashed border-[var(--border-color)] rounded-lg p-10 text-center space-y-3">
          <Sliders className="w-8 h-8 text-[var(--accent-primary)] mx-auto" />
          <h3 className="text-base font-semibold text-[var(--text-main)]">
            Ready to Run Multi-Objective Optimization
          </h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-lg mx-auto">
            Click "Compute V-03 Optimization Plans" to run the constraint solver on the 3 affected deliveries (DEL-105, DEL-106, DEL-107) and compare Plan A (Minimum Cost), Plan B (Minimum Delay), and Plan C (Balanced Recovery).
          </p>
          <button
            onClick={onTriggerV03Demo}
            disabled={isBusy}
            className="px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors cursor-pointer"
          >
            Run Optimization Engine Now
          </button>
        </div>
      ) : (
        <>
          {/* Side-by-Side Comparison Matrix Table */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-[var(--border-color)] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  Multi-Objective Plan Comparison Matrix (Click Row to Inspect XAI Rationales)
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Quantitative comparison across Plan A, Plan B, and Plan C for{' '}
                  {activeDisruption?.title}
                </p>
              </div>
              <span className="text-xs font-mono text-[var(--text-secondary)]">
                {deliveries.length} Total Orders · {vehicles.length} Fleet Units
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[var(--bg-primary)] border-b border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)]">
                    <th className="py-3 px-4">Optimization Objective</th>
                    <th className="py-3 px-4">Assigned Vehicles</th>
                    <th className="py-3 px-4 text-right">Total Distance</th>
                    <th className="py-3 px-4 text-right">Total Travel Time</th>
                    <th className="py-3 px-4 text-right">Est. Operating Cost</th>
                    <th className="py-3 px-4 text-right">Recovered</th>
                    <th className="py-3 px-4 text-right">Deadlines Met</th>
                    <th className="py-3 px-4 text-right">Unaffected Changed</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {activePlans.map((plan) => (
                    <tr
                      key={plan.id}
                      onClick={() => setInspectPlanId(plan.id)}
                      className={`cursor-pointer ${
                        inspectedPlan?.id === plan.id
                          ? 'bg-[#4CC9FF]/10'
                          : plan.is_recommended
                          ? 'bg-[#4CC9FF]/5 hover:bg-[#4CC9FF]/10'
                          : 'hover:bg-[var(--bg-elevated)]'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[var(--accent-primary)]">
                            {plan.plan_code}
                          </span>
                          <span className="font-semibold text-[var(--text-main)]">
                            {plan.plan_name}
                          </span>
                          {plan.is_recommended && (
                            <span className="text-[11px] text-emerald-400 font-medium">
                              · Recommended
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                          {plan.objective_summary}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[var(--text-main)] whitespace-nowrap">
                        {plan.assigned_vehicles.join(', ') || 'None'}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-[var(--text-main)] font-medium">
                          {plan.total_distance_km} km
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          +{plan.additional_distance_km} km deviation
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-[var(--text-main)] font-medium">
                          {plan.total_time_mins} mins
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Delay: {plan.total_delay_mins}m
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-[var(--text-main)] font-bold">
                          ${plan.estimated_cost_usd.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          +${plan.additional_cost_usd.toFixed(2)} delta
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-[var(--text-main)]">
                        {plan.deliveries_recovered} / {plan.total_affected}
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                        <span className="text-emerald-400 font-semibold">
                          {plan.deadlines_met} / {plan.total_affected} (
                          {plan.deadline_adherence_pct ?? 100}%)
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-emerald-400 font-semibold">
                        0
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {plan.status === 'Approved' ? (
                          <span className="text-emerald-400 font-mono font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Approved
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onApprovePlan(plan.id);
                            }}
                            disabled={!plan.feasible || isBusy}
                            className="px-3 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded transition-colors cursor-pointer disabled:opacity-40"
                          >
                            Select & Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Visual Charts Comparing the 3 Plans */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-[var(--text-main)] mb-1">
                Operating Cost ($ USD) vs. Route Distance (km)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Tradeoff between Minimum Cost (Plan A), Minimum Delay (Plan B), and Balanced Recovery (Plan C)
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonChartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1E293B"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="plan"
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="costUsd"
                      name="Est. Cost ($ USD)"
                      fill="#4CC9FF"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="distanceKm"
                      name="Total Distance (km)"
                      fill="#00BFFF"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-[var(--text-main)] mb-1">
                Cumulative Travel Time (mins) & Fleet Utilization (%)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Comparison of total transit duration across affected legs and resulting fleet load balance
              </p>
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonChartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1E293B"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="plan"
                      stroke="#94A3B8"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis stroke="#94A3B8" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderColor: 'var(--border-color)',
                        color: 'var(--text-main)',
                        fontSize: '12px',
                      }}
                    />
                    <Bar
                      dataKey="timeMins"
                      name="Total Travel Time (mins)"
                      fill="#38BDF8"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="utilizationPct"
                      name="Fleet Utilization (%)"
                      fill="#64748B"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Explainable AI Breakdown for Inspected Plan */}
          {inspectedPlan && (
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-[var(--accent-primary)]" />
                  <h4 className="text-sm font-semibold text-[var(--text-main)]">
                    Explainable AI Decision Breakdown — {inspectedPlan.plan_code}:{' '}
                    {inspectedPlan.plan_name}
                  </h4>
                </div>
                <span className="text-xs font-mono text-[var(--accent-primary)]">
                  {inspectedPlan.feasible
                    ? 'All Capacity & Availability Constraints Verified'
                    : 'Infeasible Plan'}
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {inspectedPlan.assignments.map((item) => (
                  <div
                    key={item.delivery_id}
                    className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded p-4 text-xs space-y-2.5"
                  >
                    <div className="font-mono font-bold text-[var(--text-main)] flex items-center justify-between border-b border-[var(--border-color)] pb-2">
                      <span>
                        {item.delivery_id} ({item.package_weight_kg}kg)
                      </span>
                      <span className="text-[var(--accent-primary)]">
                        → {item.assigned_vehicle_id}
                      </span>
                    </div>
                    <p className="text-[var(--text-main)]">{item.rationale}</p>
                    <div className="text-[11px] text-emerald-400">
                      {item.capacity_explanation}
                    </div>
                    <div className="text-[11px] text-amber-300">
                      {item.deadline_explanation}
                    </div>
                    <div className="text-[11px] text-[var(--text-secondary)]">
                      {item.cost_distance_impact}
                    </div>
                    {item.rejected_vehicles && item.rejected_vehicles.length > 0 && (
                      <div className="pt-2 border-t border-[var(--border-color)]/80 space-y-1">
                        <div className="font-semibold text-[var(--text-secondary)] text-[11px]">
                          Why Other Vehicles Were Rejected:
                        </div>
                        {item.rejected_vehicles.map((rv) => (
                          <div
                            key={rv.vehicle_id}
                            className="text-[11px] text-[var(--text-secondary)]"
                          >
                            <span className="font-mono text-rose-400">
                              {rv.vehicle_id}:
                            </span>{' '}
                            {rv.explanation}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Algorithmic Step-by-Step Explanations for Each Plan */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {activePlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-[var(--accent-primary)]">
                    {plan.plan_code} Execution Trace
                  </span>
                  {plan.feasible ? (
                    <span className="text-xs text-emerald-400 font-mono">
                      Feasible
                    </span>
                  ) : (
                    <span className="text-xs text-rose-400 font-mono flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Infeasible
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-semibold text-[var(--text-main)]">
                  {plan.plan_name}
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {plan.explanation}
                </p>
                <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
                  {plan.algorithm_steps.map((step, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-[var(--text-secondary)] flex items-start gap-2"
                    >
                      <ArrowRight className="w-3 h-3 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
