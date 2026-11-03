import React, { useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  Truck,
  X,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Delivery, Vehicle, VehicleStatus } from '../types/logistics.ts';

interface FleetManagementViewProps {
  vehicles: Vehicle[];
  deliveries: Delivery[];
  onCreateVehicle: (payload: Partial<Vehicle>) => Promise<void>;
  onUpdateVehicle: (id: string, payload: Partial<Vehicle>) => Promise<void>;
  onDeleteVehicle: (id: string) => Promise<void>;
  onSimulateVehicleBreakdown: (vehicleId: string) => Promise<void>;
}

const ALL_VEHICLE_STATUSES: VehicleStatus[] = [
  'Available',
  'Assigned',
  'In Transit',
  'Maintenance',
  'Breakdown',
];

const VEHICLE_TYPES: Vehicle['type'][] = [
  'Heavy Box Truck',
  'Medium Cargo Van',
  'Refrigerated Van',
  'Heavy Freight Sprinter',
  'Eco Express Van',
];

const HUB_LOCATIONS: Record<string, { lat: number; lng: number }> = {
  "O'Hare Logistics Hub": { lat: 41.9742, lng: -87.9073 },
  'West Loop Central Depot': { lat: 41.8825, lng: -87.6542 },
  'Cicero Distribution Center': { lat: 41.8456, lng: -87.7539 },
  'I-290 Milepost 14 (Oak Park Corridor)': { lat: 41.8736, lng: -87.7915 },
  'Skokie North Terminal': { lat: 42.0324, lng: -87.7416 },
  'Naperville West Logistics Terminal': { lat: 41.7753, lng: -88.1535 },
};

export const FleetManagementView: React.FC<FleetManagementViewProps> = ({
  vehicles,
  deliveries,
  onCreateVehicle,
  onUpdateVehicle,
  onDeleteVehicle,
  onSimulateVehicleBreakdown,
}) => {
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [formData, setFormData] = useState<{
    id: string;
    name: string;
    type: Vehicle['type'];
    max_capacity_kg: number;
    location_name: string;
    cost_per_km: number;
    speed_kmh: number;
    status: VehicleStatus;
  }>({
    id: '',
    name: '',
    type: 'Medium Cargo Van',
    max_capacity_kg: 1000,
    location_name: 'West Loop Central Depot',
    cost_per_km: 1.55,
    speed_kmh: 60,
    status: 'Available',
  });

  const filteredVehicles = vehicles.filter(
    (v) => statusFilter === 'ALL' || v.status === statusFilter
  );

  const openAddModal = () => {
    setEditingVehicle(null);
    const nextNum = vehicles.length + 1;
    const nextId = `V-0${nextNum}`;
    setFormData({
      id: nextId,
      name: `Transit Unit 0${nextNum}`,
      type: 'Medium Cargo Van',
      max_capacity_kg: 950,
      location_name: 'West Loop Central Depot',
      cost_per_km: 1.50,
      speed_kmh: 60,
      status: 'Available',
    });
    setIsModalOpen(true);
  };

  const openEditModal = (v: Vehicle) => {
    setEditingVehicle(v);
    setFormData({
      id: v.id,
      name: v.name,
      type: v.type,
      max_capacity_kg: v.max_capacity_kg,
      location_name: v.location_name,
      cost_per_km: v.cost_per_km,
      speed_kmh: v.speed_kmh,
      status: v.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const coords = HUB_LOCATIONS[formData.location_name] || {
      lat: 41.8825,
      lng: -87.6542,
    };
    const availability =
      formData.status === 'Breakdown' || formData.status === 'Maintenance'
        ? 'Unavailable'
        : 'Available';

    try {
      if (editingVehicle) {
        await onUpdateVehicle(editingVehicle.id, {
          ...formData,
          lat: coords.lat,
          lng: coords.lng,
          availability,
        });
        setFeedback({ type: 'success', text: `Updated vehicle ${editingVehicle.id}.` });
      } else {
        await onCreateVehicle({
          ...formData,
          lat: coords.lat,
          lng: coords.lng,
          availability,
        });
        setFeedback({ type: 'success', text: `Added vehicle ${formData.id} to fleet.` });
      }
      setIsModalOpen(false);
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save vehicle' });
    }
  };

  const handleStatusChange = async (v: Vehicle, newStatus: VehicleStatus) => {
    try {
      const availability =
        newStatus === 'Breakdown' || newStatus === 'Maintenance'
          ? 'Unavailable'
          : 'Available';
      await onUpdateVehicle(v.id, { status: newStatus, availability });
      setFeedback({
        type: 'success',
        text: `Vehicle ${v.id} status updated to ${newStatus} (${availability}).`,
      });
      setTimeout(() => setFeedback(null), 2500);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">Fleet Management</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Monitor vehicle capacities, operating rates ($/km), availability states, and assigned shipments.
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 self-start sm:self-auto whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Add Fleet Vehicle
        </button>
      </div>

      {feedback && (
        <div
          className={`border rounded-md p-3.5 flex items-center justify-between text-xs ${
            feedback.type === 'error'
              ? 'bg-rose-950/50 border-rose-500/40 text-rose-200'
              : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmented Status Filter */}
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md w-fit overflow-x-auto">
        {(['ALL', ...ALL_VEHICLE_STATUSES] as const).map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              statusFilter === st
                ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
            }`}
          >
            {st === 'ALL' ? `All Vehicles (${vehicles.length})` : st}
          </button>
        ))}
      </div>

      {/* Fleet Table */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)]/90 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-color)] text-[11px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-primary)]/60">
                <th className="py-3 px-4">Vehicle ID & Type</th>
                <th className="py-3 px-4">Current Location</th>
                <th className="py-3 px-4 text-right">Payload / Max Capacity</th>
                <th className="py-3 px-4 text-right">Operating Cost</th>
                <th className="py-3 px-4">Availability</th>
                <th className="py-3 px-4">Vehicle Status</th>
                <th className="py-3 px-4">Assigned Deliveries</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] text-xs">
              {filteredVehicles.map((v) => {
                const assignedOrders = deliveries.filter(
                  (d) => d.assigned_vehicle_id === v.id && d.status !== 'Delivered'
                );
                const utilPct = Math.round(
                  (v.current_load_kg / Math.max(v.max_capacity_kg, 1)) * 100
                );
                const remainingKg = v.max_capacity_kg - v.current_load_kg;

                return (
                  <tr key={v.id} className="hover:bg-[var(--bg-elevated)] transition-colors">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <Truck className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                        <div>
                          <div className="font-mono font-bold text-[var(--text-main)]">{v.id}</div>
                          <div className="text-[11px] text-[var(--text-secondary)]">
                            {v.type} · {v.speed_kmh} km/h
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="text-[var(--text-main)]">{v.location_name}</div>
                      <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                        {v.lat.toFixed(4)}, {v.lng.toFixed(4)}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                      <div>
                        <span className="text-[var(--text-main)] font-semibold">
                          {v.current_load_kg}
                        </span>
                        <span className="text-[var(--text-secondary)]"> / {v.max_capacity_kg} kg</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-secondary)]">
                        {remainingKg} kg free ({utilPct}%)
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums whitespace-nowrap text-[var(--text-main)]">
                      ${v.cost_per_km.toFixed(2)} / km
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={
                          v.availability === 'Available'
                            ? 'text-emerald-400 font-medium'
                            : 'text-rose-400 font-semibold'
                        }
                      >
                        {v.availability}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <select
                        value={v.status}
                        onChange={(e) =>
                          handleStatusChange(v, e.target.value as VehicleStatus)
                        }
                        aria-label={`Change status for ${v.id}`}
                        className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2.5 py-1 text-xs text-[var(--text-main)] focus:outline-none focus:border-[#4CC9FF]"
                      >
                        {ALL_VEHICLE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-xs text-[var(--text-secondary)]">
                      {assignedOrders.length > 0
                        ? assignedOrders.map((o) => o.id).join(', ')
                        : 'None'}
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {v.status !== 'Breakdown' && (
                          <button
                            onClick={() => onSimulateVehicleBreakdown(v.id)}
                            title={`Trigger Breakdown Analysis for ${v.id}`}
                            className="px-2.5 py-1 bg-rose-950/60 hover:bg-rose-900/70 text-rose-300 border border-rose-500/30 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Breakdown
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(v)}
                          title="Edit Vehicle"
                          className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-main)] rounded hover:bg-[var(--bg-elevated)]/60 cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDeleteVehicle(v.id)}
                          title="Remove Vehicle"
                          className="p-1.5 text-[var(--text-secondary)] hover:text-rose-400 rounded hover:bg-[var(--bg-elevated)]/60 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Vehicle Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
              <h3 className="text-base font-semibold text-[var(--text-main)]">
                {editingVehicle ? `Edit Vehicle ${editingVehicle.id}` : 'Add Fleet Vehicle'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[var(--text-secondary)] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Vehicle ID</label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingVehicle)}
                    value={formData.id}
                    onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Unit Name</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Vehicle Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData({ ...formData, type: e.target.value as Vehicle['type'] })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {VEHICLE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Maximum Capacity (kg)</label>
                  <input
                    type="number"
                    min={200}
                    max={5000}
                    required
                    value={formData.max_capacity_kg}
                    onChange={(e) =>
                      setFormData({ ...formData, max_capacity_kg: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">
                    Operating Cost ($ / km)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    min={0.5}
                    max={10}
                    required
                    value={formData.cost_per_km}
                    onChange={(e) =>
                      setFormData({ ...formData, cost_per_km: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Average Speed (km/h)</label>
                  <input
                    type="number"
                    min={25}
                    max={110}
                    required
                    value={formData.speed_kmh}
                    onChange={(e) =>
                      setFormData({ ...formData, speed_kmh: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)] font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Current Hub Location</label>
                  <select
                    value={formData.location_name}
                    onChange={(e) =>
                      setFormData({ ...formData, location_name: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {Object.keys(HUB_LOCATIONS).map((loc) => (
                      <option key={loc} value={loc}>
                        {loc}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Operational Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as VehicleStatus })
                    }
                    className="w-full px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-[var(--text-main)]"
                  >
                    {ALL_VEHICLE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-color)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-[var(--bg-elevated)] text-[var(--text-main)] rounded-md cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold rounded-md cursor-pointer"
                >
                  {editingVehicle ? 'Update Vehicle' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
