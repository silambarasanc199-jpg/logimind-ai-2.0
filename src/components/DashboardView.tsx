import React, { Suspense } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Truck,
} from 'lucide-react';
import {
  Delivery,
  Vehicle,
  DisruptionEvent,
  OptimizationPlan,
  AppSettings,
} from '../types/logistics.ts';

const CinematicHero = React.lazy(() => import('./CinematicHero.tsx'));

interface DashboardViewProps {
  theme: 'dark' | 'light';
  deliveries: Delivery[];
  vehicles: Vehicle[];
  disruptions: DisruptionEvent[];
  plans: OptimizationPlan[];
  settings: AppSettings;
  onNavigate: (page: string) => void;
  onTriggerV03Demo: () => void;
  onResetDemo: () => void;
  isBusy: boolean;
  showHero?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  theme,
  deliveries,
  vehicles,
  disruptions,
  plans,
  settings,
  onNavigate,
  onTriggerV03Demo,
  onResetDemo,
  isBusy,
  showHero = false,
}) => {
  // All dashboard values come strictly from actual application data
  const activeDeliveries = deliveries.filter((d) => d.status !== 'Delivered');
  const availableVehicles = vehicles.filter(
    (v) =>
      v.availability === 'Available' &&
      v.status !== 'Breakdown' &&
      v.status !== 'Maintenance'
  );
  const deliveriesAtRisk = deliveries.filter((d) => d.status === 'At Risk');
  const delayedDeliveries = deliveries.filter((d) => d.status === 'Delayed');

  const totalFleetCapacityKg = vehicles
    .filter((v) => v.status !== 'Breakdown' && v.status !== 'Maintenance')
    .reduce((sum, v) => sum + v.max_capacity_kg, 0);
  const totalCurrentLoadKg = vehicles
    .filter((v) => v.status !== 'Breakdown' && v.status !== 'Maintenance')
    .reduce((sum, v) => sum + v.current_load_kg, 0);

  const fleetUtilizationPct =
    totalFleetCapacityKg > 0
      ? Math.round((totalCurrentLoadKg / totalFleetCapacityKg) * 100)
      : 0;

  const estimatedOperationalCost = deliveries.reduce((sum, d) => {
    const v = vehicles.find((veh) => veh.id === d.assigned_vehicle_id);
    const rate = v ? v.cost_per_km : 1.6;
    return sum + d.estimated_distance_km * rate;
  }, 0);

  const primaryAccentHex = theme === 'light' ? '#0284C7' : '#4CC9FF';
  const secondaryAccentHex = theme === 'light' ? '#0369A1' : '#00BFFF';
  const gridStrokeHex = theme === 'light' ? '#E2E8F0' : '#1E293B';
  const axisStrokeHex = theme === 'light' ? '#475569' : '#94A3B8';
  const tooltipBgHex = theme === 'light' ? '#FFFFFF' : '#050B14';
  const tooltipTextHex = theme === 'light' ? '#0F172A' : '#F8FAFC';

  // Chart 1: Delivery Status Distribution
  const statusCounts = [
    {
      status: 'In Transit',
      count: deliveries.filter((d) => d.status === 'In Transit').length,
      color: primaryAccentHex,
    },
    {
      status: 'Assigned',
      count: deliveries.filter((d) => d.status === 'Assigned').length,
      color: secondaryAccentHex,
    },
    {
      status: 'Pending',
      count: deliveries.filter((d) => d.status === 'Pending').length,
      color: '#64748B',
    },
    {
      status: 'At Risk',
      count: deliveries.filter((d) => d.status === 'At Risk').length,
      color: '#F59E0B',
    },
    {
      status: 'Delayed',
      count: deliveries.filter((d) => d.status === 'Delayed').length,
      color: '#EF4444',
    },
    {
      status: 'Delivered',
      count: deliveries.filter((d) => d.status === 'Delivered').length,
      color: '#10B981',
    },
  ];

  // Chart 2: Vehicle Capacity Utilization
  const vehicleUtilizationData = vehicles.map((v) => ({
    id: v.id,
    name: v.id,
    usedKg: v.current_load_kg,
    maxKg: v.max_capacity_kg,
    utilizationPct: Math.round(
      (v.current_load_kg / Math.max(v.max_capacity_kg, 1)) * 100
    ),
    status: v.status,
  }));

  // Chart 3: Estimated Delivery Performance (Travel Time vs SLA Deadline Window)
  const deliveryPerformanceData = deliveries
    .filter((d) => d.status !== 'Delivered')
    .slice(0, 8)
    .map((d) => ({
      id: d.id,
      estimatedMins: d.estimated_time_mins,
      deadlineMins: d.deadline_mins,
    }));

  // Chart 4: Operational Cost Comparison (Latest Disruption Plans or Vehicle Cost Breakdown)
  const latestDisruption = disruptions[0];
  const latestPlans = latestDisruption
    ? plans.filter((p) => p.disruption_id === latestDisruption.id)
    : [];

  const costComparisonData =
    latestPlans.length > 0
      ? latestPlans.map((p) => ({
          name: `${p.plan_code} (${p.plan_name.split(' ')[1]})`,
          costUsd: Number(p.estimated_cost_usd.toFixed(2)),
          distanceKm: p.total_distance_km,
        }))
      : vehicles.map((v) => {
          const vehDeliveries = deliveries.filter(
            (d) => d.assigned_vehicle_id === v.id
          );
          const cost = vehDeliveries.reduce(
            (s, d) => s + d.estimated_distance_km * v.cost_per_km,
            0
          );
          return {
            name: v.id,
            costUsd: Number(cost.toFixed(2)),
            distanceKm: Number(
              vehDeliveries
                .reduce((s, d) => s + d.estimated_distance_km, 0)
                .toFixed(1)
            ),
          };
        });

  const v03 = vehicles.find((v) => v.id === 'V-03');
  const isV03Broken = v03?.status === 'Breakdown';

  return (
    <div className="space-y-8">
      {/* Cinematic 3D Logistics Hero Section (when rendered standalone) */}
      {showHero && (
        <Suspense
          fallback={
            <div className="h-[460px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] animate-pulse" />
          }
        >
          <CinematicHero
            theme={theme}
            activeDeliveriesCount={activeDeliveries.length}
            availableVehiclesCount={availableVehicles.length}
            totalVehiclesCount={vehicles.length}
            isV03Broken={Boolean(isV03Broken)}
            onExploreOptimization={() => onNavigate('optimization')}
            onViewDemo={onTriggerV03Demo}
          />
        </Suspense>
      )}

      {/* Dataset Provenance & Hackathon Demo Scenario Banner */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors duration-200">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
            <span className="text-[var(--accent-primary)] font-medium">
              Dataset Mode: Demo Dataset
            </span>
            <span aria-hidden="true">·</span>
            <span>{settings.dataset_label}</span>
            <span aria-hidden="true">·</span>
            <span>Calculated Route Estimates (1.28x Urban Road Factor)</span>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Disruption Recovery & Fleet Dispatch Command
          </h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-3xl">
            {isV03Broken
              ? 'Vehicle V-03 breakdown recorded on I-290. Review generated recovery plans (Plan A, Plan B, Plan C) and approve reassignment for affected orders DEL-105, DEL-106, and DEL-107.'
              : 'Initial scenario ready: 10 delivery orders across 5 vehicles. Trigger the signature Vehicle V-03 Breakdown scenario to evaluate constraint-based recovery plans.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {!isV03Broken ? (
            <button
              onClick={onTriggerV03Demo}
              disabled={isBusy}
              className="px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <ShieldAlert className="w-4 h-4" />
              Trigger V-03 Breakdown Scenario
            </button>
          ) : (
            <button
              onClick={() => onNavigate('disruptions')}
              className="px-4 py-2.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Review V-03 Recovery Plans
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onResetDemo}
            disabled={isBusy}
            className="px-3.5 py-2.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-main)] border border-[var(--border-color)] text-xs font-medium rounded-md transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[var(--text-secondary)]" />
            Reset Demo Dataset
          </button>
        </div>
      </div>

      {/* 6 Primary Operational KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>Active Deliveries</span>
            <Package className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
            {activeDeliveries.length}
            <span className="text-sm font-normal text-[var(--text-secondary)]">
              {' '}
              / {deliveries.length}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {deliveries.filter((d) => d.status === 'Delivered').length} completed
            today
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>Available Vehicles</span>
            <Truck className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
            {availableVehicles.length}
            <span className="text-sm font-normal text-[var(--text-secondary)]">
              {' '}
              / {vehicles.length}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            {vehicles.filter((v) => v.status === 'Breakdown').length} in breakdown
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>Deliveries At Risk</span>
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {deliveriesAtRisk.length}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            Requires reassignment
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>Delayed Deliveries</span>
            <Clock className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
            {delayedDeliveries.length}
          </div>
          <div className="mt-1 text-xs text-[var(--text-secondary)]">
            SLA window exceeded
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>Fleet Utilization</span>
            <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
            {fleetUtilizationPct}%
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {totalCurrentLoadKg} / {totalFleetCapacityKg} kg
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-2">
            <span>Est. Operational Cost</span>
            <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums text-[var(--text-main)]">
            ${estimatedOperationalCost.toFixed(2)}
          </div>
          <div className="mt-1 text-xs font-mono tabular-nums text-[var(--text-secondary)]">
            {deliveries
              .reduce((s, d) => s + d.estimated_distance_km, 0)
              .toFixed(1)}{' '}
            km total
          </div>
        </div>
      </div>

      {/* 4 Analytical Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Delivery Status Distribution */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                Delivery Status Distribution
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Order count by current operational state ({deliveries.length} total
                orders)
              </p>
            </div>
            <button
              onClick={() => onNavigate('deliveries')}
              className="text-xs text-[var(--accent-primary)] hover:underline whitespace-nowrap cursor-pointer"
            >
              Manage Deliveries
            </button>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={statusCounts}
                margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStrokeHex}
                  vertical={false}
                />
                <XAxis
                  dataKey="status"
                  stroke={axisStrokeHex}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  stroke={axisStrokeHex}
                  fontSize={11}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBgHex,
                    borderColor: gridStrokeHex,
                    color: tooltipTextHex,
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="count" name="Deliveries" radius={[4, 4, 0, 0]}>
                  {statusCounts.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Vehicle Capacity Utilization */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                Vehicle Payload Utilization (kg)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Assigned load vs. maximum rated capacity per fleet unit
              </p>
            </div>
            <button
              onClick={() => onNavigate('fleet')}
              className="text-xs text-[var(--accent-primary)] hover:underline whitespace-nowrap cursor-pointer"
            >
              Inspect Fleet
            </button>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={vehicleUtilizationData}
                margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStrokeHex}
                  vertical={false}
                />
                <XAxis
                  dataKey="id"
                  stroke={axisStrokeHex}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke={axisStrokeHex} fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBgHex,
                    borderColor: gridStrokeHex,
                    color: tooltipTextHex,
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="usedKg"
                  name="Current Load (kg)"
                  fill={primaryAccentHex}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="maxKg"
                  name="Max Capacity (kg)"
                  fill="#64748B"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Estimated Delivery Performance */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                Estimated Delivery Performance vs. SLA Window (mins)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Calculated travel time compared against remaining deadline window
              </p>
            </div>
            <button
              onClick={() => onNavigate('routes')}
              className="text-xs text-[var(--accent-primary)] hover:underline whitespace-nowrap cursor-pointer"
            >
              Route Planner
            </button>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={deliveryPerformanceData}
                margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStrokeHex}
                  vertical={false}
                />
                <XAxis
                  dataKey="id"
                  stroke={axisStrokeHex}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke={axisStrokeHex} fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBgHex,
                    borderColor: gridStrokeHex,
                    color: tooltipTextHex,
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="estimatedMins"
                  name="Est. Travel Time (mins)"
                  fill={secondaryAccentHex}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="deadlineMins"
                  name="SLA Deadline (mins)"
                  fill="#64748B"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Operational Cost Comparison */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                {latestPlans.length > 0
                  ? 'Recovery Plan Cost & Distance Comparison'
                  : 'Operational Cost by Fleet Vehicle ($ USD)'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                {latestPlans.length > 0
                  ? `Comparing generated alternatives for ${latestDisruption?.id}`
                  : 'Calculated from assigned route distance × vehicle operating rate ($/km)'}
              </p>
            </div>
            <button
              onClick={() => onNavigate('optimization')}
              className="text-xs text-[var(--accent-primary)] hover:underline whitespace-nowrap cursor-pointer"
            >
              AI Optimization Center
            </button>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={costComparisonData}
                margin={{ top: 8, right: 12, left: -8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={gridStrokeHex}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  stroke={axisStrokeHex}
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis stroke={axisStrokeHex} fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: tooltipBgHex,
                    borderColor: gridStrokeHex,
                    color: tooltipTextHex,
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="costUsd"
                  name="Est. Cost ($ USD)"
                  fill={primaryAccentHex}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="distanceKm"
                  name="Route Distance (km)"
                  fill="#64748B"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Split: Recent Disruptions & Recent Optimization Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Disruptions */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Recent Disruptions
            </h3>
            <button
              onClick={() => onNavigate('disruptions')}
              className="text-xs text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              Open Disruption Center
            </button>
          </div>

          {disruptions.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-[var(--border-color)] rounded-md p-4">
              <p className="text-sm text-[var(--text-main)] font-medium mb-1">
                No Active or Logged Disruptions
              </p>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                All 5 fleet vehicles are operating on baseline schedules. Trigger
                the V-03 breakdown scenario to evaluate automated recovery.
              </p>
              <button
                onClick={onTriggerV03Demo}
                disabled={isBusy}
                className="px-3.5 py-2 bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md hover:bg-[var(--accent-secondary)] transition-colors cursor-pointer"
              >
                Simulate V-03 Breakdown Now
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {disruptions.slice(0, 4).map((dis) => (
                <div key={dis.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-[var(--text-main)]">
                      {dis.title}
                    </span>
                    <span
                      className={`text-xs font-mono ${
                        dis.status === 'Resolved'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {dis.status}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">
                    {dis.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] font-mono">
                    <span>ID: {dis.id}</span>
                    <span aria-hidden="true">·</span>
                    <span>Type: {dis.type}</span>
                    <span aria-hidden="true">·</span>
                    <span>Affected: {dis.affected_delivery_ids.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Optimization Recommendations */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Recent Optimization Recommendations
            </h3>
            <button
              onClick={() => onNavigate('optimization')}
              className="text-xs text-[var(--accent-primary)] hover:underline cursor-pointer"
            >
              Compare All Plans
            </button>
          </div>

          {plans.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-[var(--border-color)] rounded-md p-4">
              <p className="text-sm text-[var(--text-main)] font-medium mb-1">
                No Recovery Plans Generated Yet
              </p>
              <p className="text-xs text-[var(--text-secondary)] mb-4">
                Initiate a disruption analysis to generate Plan A (Min Cost), Plan
                B (Min Delay), and Plan C (Balanced Optimization).
              </p>
              <button
                onClick={() => onNavigate('disruptions')}
                className="px-3.5 py-2 bg-[var(--bg-elevated)] text-[var(--text-main)] hover:opacity-90 border border-[var(--border-color)] font-medium text-xs rounded-md transition-colors cursor-pointer"
              >
                Go to Disruption Management
              </button>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {plans.slice(0, 3).map((plan) => (
                <div key={plan.id} className="py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[var(--text-main)]">
                        {plan.plan_code}: {plan.plan_name}
                      </span>
                      {plan.is_recommended && (
                        <span className="text-xs text-[var(--accent-primary)] font-medium">
                          · Recommended
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-xs font-mono ${
                        plan.status === 'Approved'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : plan.status === 'Rejected'
                          ? 'text-[var(--text-secondary)]'
                          : 'text-[var(--accent-primary)]'
                      }`}
                    >
                      {plan.status === 'Approved' && (
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
                      )}
                      {plan.status}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mb-2">
                    {plan.explanation}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                    <span>Cost: ${plan.estimated_cost_usd.toFixed(2)}</span>
                    <span aria-hidden="true">·</span>
                    <span>Distance: {plan.total_distance_km} km</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      Deadlines Met: {plan.deadlines_met}/{plan.total_affected}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>Vehicles: {plan.assigned_vehicles.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
