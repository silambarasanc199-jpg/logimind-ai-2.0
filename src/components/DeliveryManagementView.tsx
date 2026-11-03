import React, { useState } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  Eye,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  Delivery,
  DeliveryPriority,
  DeliveryStatus,
  Vehicle,
} from '../types/logistics.ts';

interface DeliveryManagementViewProps {
  deliveries: Delivery[];
  vehicles: Vehicle[];
  onCreateDelivery: (payload: Partial<Delivery>) => Promise<void>;
  onUpdateDelivery: (id: string, payload: Partial<Delivery>) => Promise<void>;
  onDeleteDelivery: (id: string) => Promise<void>;
}

const LOCATION_PRESETS: Record<string, { lat: number; lng: number; corridor: string }> = {
  "O'Hare Logistics Hub": { lat: 41.9742, lng: -87.9073, corridor: 'I-90 Northwest Corridor' },
  'West Loop Central Depot': { lat: 41.8825, lng: -87.6542, corridor: 'Downtown Core Loop' },
  'Cicero Distribution Center': { lat: 41.8456, lng: -87.7539, corridor: 'I-55 Southwest Corridor' },
  'I-290 Milepost 14 (Oak Park Transfer)': { lat: 41.8736, lng: -87.7915, corridor: 'I-290 Westbound Corridor' },
  'Skokie North Terminal': { lat: 42.0324, lng: -87.7416, corridor: 'I-94 North Shore Corridor' },
  'Oak Brook Regional Medical Center': { lat: 41.8484, lng: -87.9537, corridor: 'I-290 Westbound Corridor' },
  'Downers Grove Precision Assembly': { lat: 41.8089, lng: -88.0112, corridor: 'I-290 Westbound Corridor' },
  'Naperville West Logistics Terminal': { lat: 41.7753, lng: -88.1535, corridor: 'I-290 Westbound Corridor' },
  'Schaumburg Commerce Center': { lat: 42.0334, lng: -88.0834, corridor: 'I-90 Northwest Corridor' },
  'Evanston Biotech Campus': { lat: 42.0565, lng: -87.6753, corridor: 'I-94 North Shore Corridor' },
  'Bridgeview Freight Annex': { lat: 41.7509, lng: -87.8042, corridor: 'I-55 Southwest Corridor' },
};

const ALL_STATUSES: DeliveryStatus[] = [
  'Pending',
  'Assigned',
  'In Transit',
  'At Risk',
  'Delivered',
  'Delayed',
];

const ALL_PRIORITIES: DeliveryPriority[] = ['Critical', 'High', 'Standard'];

export const DeliveryManagementView: React.FC<DeliveryManagementViewProps> = ({
  deliveries,
  vehicles,
  onCreateDelivery,
  onUpdateDelivery,
  onDeleteDelivery,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatuses, setSelectedStatuses] = useState<DeliveryStatus[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const toggleStatusChip = (status: DeliveryStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status]
    );
  };

  const clearStatusFilters = () => {
    setSelectedStatuses([]);
  };

  // Form state for Create / Edit
  const [formData, setFormData] = useState<{
    id: string;
    pickup_location: string;
    destination: string;
    package_weight_kg: number;
    required_capacity_kg: number;
    deadline_mins: number;
    deadline_label: string;
    assigned_vehicle_id: string;
    status: DeliveryStatus;
    priority: DeliveryPriority;
    route_corridor: string;
  }>({
    id: '',
    pickup_location: 'West Loop Central Depot',
    destination: 'Oak Brook Regional Medical Center',
    package_weight_kg: 220,
    required_capacity_kg: 500,
    deadline_mins: 120,
    deadline_label: '10:30 AM (120m)',
    assigned_vehicle_id: '',
    status: 'Pending',
    priority: 'High',
    route_corridor: 'I-290 Westbound Corridor',
  });

  const filteredDeliveries = deliveries.filter((d) => {
    const matchesSearch =
      d.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.pickup_location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      d.destination.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (d.assigned_vehicle_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      selectedStatuses.length === 0 || selectedStatuses.includes(d.status);
    const matchesPriority = priorityFilter === 'ALL' || d.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const openCreateModal = () => {
    setErrorMsg(null);
    setEditingDelivery(null);
    setFormData({
      id: `DEL-${101 + deliveries.length}`,
      pickup_location: 'West Loop Central Depot',
      destination: 'Oak Brook Regional Medical Center',
      package_weight_kg: 220,
      required_capacity_kg: 500,
      deadline_mins: 120,
      deadline_label: '10:30 AM (120m)',
      assigned_vehicle_id: '',
      status: 'Pending',
      priority: 'High',
      route_corridor: 'I-290 Westbound Corridor',
    });
    setIsCreateModalOpen(true);
  };

  const openEditModal = (d: Delivery) => {
    setErrorMsg(null);
    setEditingDelivery(d);
    setFormData({
      id: d.id,
      pickup_location: d.pickup_location,
      destination: d.destination,
      package_weight_kg: d.package_weight_kg,
      required_capacity_kg: d.required_capacity_kg,
      deadline_mins: d.deadline_mins,
      deadline_label: d.deadline_label,
      assigned_vehicle_id: d.assigned_vehicle_id || '',
      status: d.status,
      priority: d.priority,
      route_corridor: d.route_corridor,
    });
    setIsCreateModalOpen(true);
  };

  // Helper to check if a vehicle is feasible for a given weight and required capacity
  const getVehicleFeasibility = (
    v: Vehicle,
    weightKg: number,
    reqCapKg: number,
    currentDeliveryId?: string
  ) => {
    if (v.status === 'Breakdown' || v.status === 'Maintenance' || v.availability !== 'Available') {
      return {
        feasible: false,
        reason: `Unavailable (${v.status})`,
        remainingKg: 0,
      };
    }
    if (v.max_capacity_kg < reqCapKg) {
      return {
        feasible: false,
        reason: `Max cap ${v.max_capacity_kg}kg < req ${reqCapKg}kg`,
        remainingKg: v.max_capacity_kg - v.current_load_kg,
      };
    }
    const otherActiveLoad = deliveries
      .filter(
        (d) =>
          d.assigned_vehicle_id === v.id &&
          d.id !== currentDeliveryId &&
          d.status !== 'Delivered'
      )
      .reduce((sum, d) => sum + d.package_weight_kg, 0);
    const remainingKg = v.max_capacity_kg - otherActiveLoad;
    if (weightKg > remainingKg) {
      return {
        feasible: false,
        reason: `Insufficient free cap (${remainingKg}kg free < ${weightKg}kg)`,
        remainingKg,
      };
    }
    return {
      feasible: true,
      reason: `${remainingKg} kg available`,
      remainingKg,
    };
  };

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const pickupCoords = LOCATION_PRESETS[formData.pickup_location] || {
      lat: 41.8825,
      lng: -87.6542,
      corridor: 'I-290 Westbound Corridor',
    };
    const destCoords = LOCATION_PRESETS[formData.destination] || {
      lat: 41.8484,
      lng: -87.9537,
      corridor: 'I-290 Westbound Corridor',
    };

    const payload: Partial<Delivery> = {
      id: formData.id,
      pickup_location: formData.pickup_location,
      pickup_lat: pickupCoords.lat,
      pickup_lng: pickupCoords.lng,
      destination: formData.destination,
      dest_lat: destCoords.lat,
      dest_lng: destCoords.lng,
      package_weight_kg: Number(formData.package_weight_kg),
      required_capacity_kg: Number(formData.required_capacity_kg),
      deadline_mins: Number(formData.deadline_mins),
      deadline_label: formData.deadline_label || `${formData.deadline_mins} mins SLA`,
      assigned_vehicle_id: formData.assigned_vehicle_id || null,
      status: formData.status,
      priority: formData.priority,
      route_corridor: formData.route_corridor || destCoords.corridor,
    };

    try {
      if (editingDelivery) {
        await onUpdateDelivery(editingDelivery.id, payload);
        setSuccessMsg(`Updated delivery ${editingDelivery.id}.`);
      } else {
        await onCreateDelivery(payload);
        setSuccessMsg(`Created delivery ${payload.id}.`);
      }
      setIsCreateModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Constraint validation error');
    }
  };

  const handleQuickStatusChange = async (d: Delivery, newStatus: DeliveryStatus) => {
    setErrorMsg(null);
    try {
      await onUpdateDelivery(d.id, { status: newStatus });
      setSuccessMsg(`Updated ${d.id} status to ${newStatus}.`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleQuickVehicleAssign = async (d: Delivery, vehicleId: string) => {
    setErrorMsg(null);
    try {
      await onUpdateDelivery(d.id, {
        assigned_vehicle_id: vehicleId || null,
        status: vehicleId ? (d.status === 'Pending' ? 'Assigned' : d.status) : 'Pending',
      });
      setSuccessMsg(
        vehicleId
          ? `Assigned ${d.id} to vehicle ${vehicleId}.`
          : `Unassigned vehicle from ${d.id}.`
      );
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const getStatusColorClass = (status: DeliveryStatus) => {
    switch (status) {
      case 'Delivered':
        return 'text-emerald-400';
      case 'In Transit':
        return 'text-[var(--accent-primary)]';
      case 'Assigned':
        return 'text-[#00BFFF]';
      case 'At Risk':
        return 'text-amber-400 font-semibold';
      case 'Delayed':
        return 'text-rose-400 font-semibold';
      default:
        return 'text-[var(--text-secondary)]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Delivery Management</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Manage delivery orders, verify vehicle capacity constraints, and update shipment statuses.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 self-start lg:self-auto whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Create Delivery Order
        </button>
      </div>

      {/* Feedback Banner */}
      {errorMsg && (
        <div className="bg-rose-950/50 border border-rose-500/40 rounded-md p-3.5 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-md p-3.5 flex items-center justify-between text-xs text-emerald-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Multi-Select Status Filter Chips Bar */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg p-4 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Delivery ID, pickup, destination, or vehicle..."
              className="w-full pl-9 pr-4 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)] placeholder-[#94A3B8] focus:outline-none focus:border-[#4CC9FF]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Quick Pipeline Presets */}
            <button
              type="button"
              onClick={() => setSelectedStatuses(['At Risk', 'Delayed'])}
              className="px-2.5 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors cursor-pointer"
            >
              Isolate At-Risk & Delayed
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatuses(['Pending', 'Assigned', 'In Transit'])}
              className="px-2.5 py-1.5 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-main)] text-xs font-medium transition-colors cursor-pointer"
            >
              Active Dispatch Pipeline
            </button>

            {/* Priority Filter */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)] focus:outline-none focus:border-[#4CC9FF]"
            >
              <option value="ALL">All Priorities</option>
              {ALL_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  Priority: {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Multi-Select Status Filter Chips */}
        <div className="pt-3 border-t border-[var(--border-subtle)] flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div
            role="group"
            aria-label="Multi-select delivery status filter chips"
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] mr-1">
              Isolate Status Pipeline:
            </span>

            <button
              type="button"
              onClick={clearStatusFilters}
              aria-pressed={selectedStatuses.length === 0}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                selectedStatuses.length === 0
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] border-[var(--accent-primary)] font-semibold'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-main)]'
              }`}
            >
              <span>All Statuses</span>
              <span
                className={`font-mono text-[10px] px-1.5 py-0.2 rounded tabular-nums ${
                  selectedStatuses.length === 0
                    ? 'bg-black/20 text-[var(--accent-contrast)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                }`}
              >
                {deliveries.length}
              </span>
            </button>

            {ALL_STATUSES.map((st) => {
              const isSelected = selectedStatuses.includes(st);
              const count = deliveries.filter((d) => d.status === st).length;
              const dotColor =
                st === 'Delivered'
                  ? 'bg-emerald-400'
                  : st === 'In Transit'
                  ? 'bg-[#4CC9FF]'
                  : st === 'Assigned'
                  ? 'bg-[#00BFFF]'
                  : st === 'At Risk'
                  ? 'bg-amber-400'
                  : st === 'Delayed'
                  ? 'bg-rose-400'
                  : 'bg-slate-400';

              const selectedChipClass =
                st === 'At Risk'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/60 font-semibold shadow-sm'
                  : st === 'Delayed'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/60 font-semibold shadow-sm'
                  : st === 'Delivered'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/60 font-semibold shadow-sm'
                  : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border-[var(--accent-primary)] font-semibold shadow-sm';

              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => toggleStatusChip(st)}
                  aria-pressed={isSelected}
                  title={`Toggle ${st} pipeline filter (${count} orders)`}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? selectedChipClass
                      : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-main)] hover:border-slate-600'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                      isSelected
                        ? 'border-current bg-current/20'
                        : 'border-slate-600 bg-transparent'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                  </span>
                  <span>{st}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded tabular-nums ${
                      isSelected
                        ? 'bg-black/25 text-current'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {count}
                  </span>
                  {isSelected && <X className="w-3 h-3 ml-0.5 opacity-80" />}
                </button>
              );
            })}
          </div>

          {/* Isolated Pipeline Summary Metrics */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
            <span>
              Pipeline Orders:{' '}
              <strong className="text-[var(--text-main)]">
                {filteredDeliveries.length}/{deliveries.length}
              </strong>
            </span>
            <span>·</span>
            <span>
              Payload:{' '}
              <strong className="text-[var(--accent-primary)]">
                {filteredDeliveries.reduce((sum, d) => sum + d.package_weight_kg, 0)} kg
              </strong>
            </span>
            {selectedStatuses.length > 0 && (
              <>
                <span>·</span>
                <button
                  type="button"
                  onClick={clearStatusFilters}
                  className="text-[var(--accent-primary)] hover:underline font-sans font-medium cursor-pointer"
                >
                  Clear ({selectedStatuses.length})
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* High-Density Deliveries Table */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-primary)]/60">
                <th className="py-3 px-4">Delivery ID</th>
                <th className="py-3 px-4">Pickup & Destination</th>
                <th className="py-3 px-4 text-right">Weight / Req. Cap</th>
                <th className="py-3 px-4">Deadline</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Assigned Vehicle</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Est. Dist / Time</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-[var(--text-secondary)]">
                    No deliveries match your current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map((d) => (
                  <tr
                    key={d.id}
                    className="hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <td className="py-3 px-4 font-mono font-semibold text-[var(--text-main)] whitespace-nowrap">
                      {d.id}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-[var(--text-main)] font-medium">{d.destination}</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        From: {d.pickup_location} · {d.route_corridor}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className="text-[var(--text-main)] font-medium">{d.package_weight_kg} kg</span>
                      <span className="text-[var(--text-secondary)]"> / {d.required_capacity_kg} kg</span>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[var(--text-main)] whitespace-nowrap">
                      {d.deadline_label}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
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
                    <td className="py-3 px-4 whitespace-nowrap">
                      <select
                        value={d.assigned_vehicle_id || ''}
                        onChange={(e) => handleQuickVehicleAssign(d, e.target.value)}
                        aria-label={`Assign vehicle for ${d.id}`}
                        className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs font-mono text-[var(--text-main)] focus:outline-none focus:border-[#4CC9FF]"
                      >
                        <option value="">Unassigned</option>
                        {vehicles.map((v) => {
                          const check = getVehicleFeasibility(
                            v,
                            d.package_weight_kg,
                            d.required_capacity_kg,
                            d.id
                          );
                          const isCurrent = d.assigned_vehicle_id === v.id;
                          return (
                            <option
                              key={v.id}
                              value={v.id}
                              disabled={!check.feasible && !isCurrent}
                            >
                              {v.id} ({check.feasible || isCurrent ? `${check.remainingKg}kg free` : check.reason})
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <select
                        value={d.status}
                        onChange={(e) =>
                          handleQuickStatusChange(d, e.target.value as DeliveryStatus)
                        }
                        aria-label={`Update status for ${d.id}`}
                        className={`bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs focus:outline-none focus:border-[#4CC9FF] ${getStatusColorClass(
                          d.status
                        )}`}
                      >
                        {ALL_STATUSES.map((st) => (
                          <option key={st} value={st} className="text-[var(--text-main)] bg-[var(--bg-primary)]">
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-[var(--text-main)]">{d.estimated_distance_km} km</div>
                      <div className="text-[11px] text-[var(--text-secondary)]">{d.estimated_time_mins} mins</div>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setSelectedDelivery(d)}
                          title="View Delivery Details"
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] rounded hover:bg-[var(--bg-elevated)]/60 transition-colors cursor-pointer"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(d)}
                          title="Edit Delivery"
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-elevated)]/60 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteDelivery(d.id)}
                          title="Delete Delivery"
                          className="p-1.5 text-[var(--text-secondary)] hover:text-rose-400 rounded hover:bg-[var(--bg-elevated)]/60 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery Details Drawer/Modal */}
      {selectedDelivery && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <div>
                <span className="text-xs font-mono text-[var(--accent-primary)]">
                  Delivery Specification
                </span>
                <h3 className="text-base font-semibold text-[var(--text-main)]">
                  {selectedDelivery.id} — {selectedDelivery.destination}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[var(--text-secondary)]">Pickup Location</div>
                <div className="text-[var(--text-main)] font-medium mt-0.5">
                  {selectedDelivery.pickup_location}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                  {selectedDelivery.pickup_lat.toFixed(4)}, {selectedDelivery.pickup_lng.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Destination</div>
                <div className="text-[var(--text-main)] font-medium mt-0.5">
                  {selectedDelivery.destination}
                </div>
                <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                  {selectedDelivery.dest_lat.toFixed(4)}, {selectedDelivery.dest_lng.toFixed(4)}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Package Weight</div>
                <div className="text-[var(--text-main)] font-mono tabular-nums font-semibold mt-0.5">
                  {selectedDelivery.package_weight_kg} kg
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Required Vehicle Capacity</div>
                <div className="text-[var(--text-main)] font-mono tabular-nums font-semibold mt-0.5">
                  {selectedDelivery.required_capacity_kg} kg
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Delivery Deadline</div>
                <div className="text-[var(--text-main)] font-mono tabular-nums mt-0.5">
                  {selectedDelivery.deadline_label} ({selectedDelivery.deadline_mins} mins)
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Priority & Status</div>
                <div className="text-[var(--text-main)] mt-0.5">
                  {selectedDelivery.priority} · {selectedDelivery.status}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Assigned Vehicle</div>
                <div className="text-[var(--text-main)] font-mono mt-0.5">
                  {selectedDelivery.assigned_vehicle_id || 'Unassigned'}
                </div>
              </div>
              <div>
                <div className="text-[var(--text-secondary)]">Calculated Route Estimate</div>
                <div className="text-[var(--text-main)] font-mono tabular-nums mt-0.5">
                  {selectedDelivery.estimated_distance_km} km · {selectedDelivery.estimated_time_mins} mins
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
              <button
                onClick={() => {
                  const d = selectedDelivery;
                  setSelectedDelivery(null);
                  openEditModal(d);
                }}
                className="px-3.5 py-2 bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md cursor-pointer"
              >
                Edit Order
              </button>
              <button
                onClick={() => setSelectedDelivery(null)}
                className="px-3.5 py-2 bg-[var(--bg-elevated)] text-[var(--text-main)] text-xs rounded-md cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Delivery Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg max-w-xl w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                {editingDelivery ? `Edit Delivery ${editingDelivery.id}` : 'Create New Delivery Order'}
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Delivery ID</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingDelivery)}
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Priority Level</label>
                  <select
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: e.target.value as DeliveryPriority })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {ALL_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Pickup Location</label>
                  <select
                    value={formData.pickup_location}
                    onChange={(e) =>
                      setFormData({ ...formData, pickup_location: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {Object.keys(LOCATION_PRESETS).map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Destination</label>
                  <select
                    value={formData.destination}
                    onChange={(e) =>
                      setFormData({ ...formData, destination: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {Object.keys(LOCATION_PRESETS).map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Package Weight (kg)</label>
                  <input
                    type="number"
                    min={10}
                    max={2000}
                    required
                    value={formData.package_weight_kg}
                    onChange={(e) =>
                      setFormData({ ...formData, package_weight_kg: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    Required Vehicle Capacity (kg)
                  </label>
                  <input
                    type="number"
                    min={100}
                    max={3000}
                    required
                    value={formData.required_capacity_kg}
                    onChange={(e) =>
                      setFormData({ ...formData, required_capacity_kg: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    SLA Deadline Window (mins)
                  </label>
                  <input
                    type="number"
                    min={20}
                    max={600}
                    required
                    value={formData.deadline_mins}
                    onChange={(e) => {
                      const mins = Number(e.target.value);
                      setFormData({
                        ...formData,
                        deadline_mins: mins,
                        deadline_label: `${mins}m Window`,
                      });
                    }}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Delivery Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as DeliveryStatus })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {ALL_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[var(--text-secondary)] mb-1">
                    Assign Vehicle (Enforces Availability & Capacity Constraints)
                  </label>
                  <select
                    value={formData.assigned_vehicle_id}
                    onChange={(e) =>
                      setFormData({ ...formData, assigned_vehicle_id: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  >
                    <option value="">Leave Unassigned (Pending Dispatch)</option>
                    {vehicles.map((v) => {
                      const check = getVehicleFeasibility(
                        v,
                        formData.package_weight_kg,
                        formData.required_capacity_kg,
                        editingDelivery?.id
                      );
                      return (
                        <option key={v.id} value={v.id} disabled={!check.feasible}>
                          {v.id} · {v.type} — Max {v.max_capacity_kg}kg ({check.reason})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 bg-[var(--bg-elevated)] text-[var(--text-main)] rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold rounded-md cursor-pointer"
                >
                  {editingDelivery ? 'Save Delivery Changes' : 'Create Delivery'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
