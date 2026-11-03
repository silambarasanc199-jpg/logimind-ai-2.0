import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  seedDeterministicDemoDataset,
  restoreSnapshotToDatabase,
  getFullSystemState,
  getAppSettings,
  getDeliveryById,
  getVehicleById,
  insertDeliveryRecord,
  updateDeliveryRecord,
  deleteDeliveryRecord,
  insertVehicleRecord,
  updateVehicleRecord,
  deleteVehicleRecord,
  saveDisruptionAndPlans,
  persistApprovedPlanExecution,
  rejectOptimizationPlanById,
  getDisruptionById,
  insertExperimentRecord,
  clearExperimentRecords,
  upsertSettingsRecords,
} from './src/db/logistics.ts';
import { getOrCreateUser, getUsers } from './src/db/users.ts';
import {
  requireAuth,
  attachOptionalAuth,
  AuthRequest,
} from './src/middleware/auth.ts';
import {
  calculateRoadDistanceKm,
  calculateTravelTimeMins,
  generateDisruptionRecoveryPlans,
  runControlledExperimentScenario,
} from './src/server/optimizer.ts';
import {
  Delivery,
  DisruptionType,
  DisruptionSnapshot,
} from './src/types/logistics.ts';
import {
  runMultiTurnChat,
  runGoogleMapsGrounding,
  runGoogleSearchGrounding,
  runLyriaMusicGeneration,
} from './src/server/gemini.ts';
import {
  calculateRoute,
  generateDisruptionRecovery,
  geocodeWithNominatim,
  fetchCorridorWeatherDisruption,
} from './src/server/externalApis.ts';

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(attachOptionalAuth);

  // Authenticated User Profile Sync & Directory Endpoints (Firebase Auth + Cloud SQL)
  app.get('/api/users', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const allUsers = await getUsers();
      res.json(allUsers);
    } catch (error: any) {
      console.error('Failed to fetch users:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch users' });
    }
  });

  app.post('/api/users/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || req.body?.email;
      if (!uid || !email) {
        return res
          .status(400)
          .json({ error: 'Authenticated user UID and email are required.' });
      }
      const userRecord = await getOrCreateUser(
        uid,
        email,
        req.body?.name || req.user?.name,
        req.body?.role,
        req.body?.facility
      );
      res.json({ user: userRecord });
    } catch (error: any) {
      console.error('Failed to sync user:', error);
      res.status(500).json({ error: error.message || 'Failed to sync user' });
    }
  });

  // 1. Get Full System State
  app.get('/api/state', async (_req, res) => {
    try {
      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load state' });
    }
  });

  // 2. Reset Deterministic Demo Dataset
  app.post('/api/reset-demo', async (_req, res) => {
    try {
      await seedDeterministicDemoDataset();
      const state = await getFullSystemState();
      res.json({ message: 'Deterministic demo dataset restored.', state });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to reset dataset' });
    }
  });

  // 3. Create Delivery (with strict vehicle constraint & duplicate check)
  app.post('/api/deliveries', async (req, res) => {
    try {
      const body = req.body;
      const settings = await getAppSettings();
      const id =
        body.id?.trim() || `DEL-${Math.floor(111 + Math.random() * 888)}`;

      const existingId = await getDeliveryById(id);
      if (existingId) {
        return res.status(400).json({
          error: `Data Integrity Error: Delivery ID ${id} already exists. Duplicate delivery IDs are not permitted.`,
        });
      }

      const packageWeight = Number(body.package_weight_kg) || 150;
      const requiredCap = Number(body.required_capacity_kg) || packageWeight;
      const assignedVehicleId = body.assigned_vehicle_id || null;

      if (assignedVehicleId) {
        const v = await getVehicleById(assignedVehicleId);
        if (!v) {
          return res
            .status(400)
            .json({ error: `Vehicle ${assignedVehicleId} not found.` });
        }
        if (
          v.status === 'Breakdown' ||
          v.status === 'Maintenance' ||
          v.availability !== 'Available'
        ) {
          return res.status(400).json({
            error: `Cannot assign ${v.id}: Vehicle is currently ${v.status} (${v.availability}).`,
          });
        }
        if (v.max_capacity_kg < requiredCap) {
          return res.status(400).json({
            error: `Constraint Violation: ${v.id} max capacity (${v.max_capacity_kg} kg) is less than required capacity (${requiredCap} kg).`,
          });
        }
        const remaining = v.max_capacity_kg - v.current_load_kg;
        if (packageWeight > remaining) {
          return res.status(400).json({
            error: `Capacity Constraint Violation: ${v.id} only has ${remaining} kg remaining capacity, which is insufficient for ${packageWeight} kg package.`,
          });
        }
      }

      const pickupLat = Number(body.pickup_lat) || 41.8825;
      const pickupLng = Number(body.pickup_lng) || -87.6542;
      const destLat = Number(body.dest_lat) || 41.8484;
      const destLng = Number(body.dest_lng) || -87.9537;

      const distKm =
        Number(body.estimated_distance_km) ||
        calculateRoadDistanceKm(
          pickupLat,
          pickupLng,
          destLat,
          destLng,
          settings.road_tortuosity_factor
        );
      const timeMins =
        Number(body.estimated_time_mins) ||
        calculateTravelTimeMins(
          distKm,
          58,
          settings.transfer_handover_mins,
          1.0
        );

      const deadlineMins = Number(body.deadline_mins) || 120;
      const deadlineLabel = body.deadline_label || `${deadlineMins} mins SLA`;
      const now = new Date().toISOString();

      await insertDeliveryRecord({
        id,
        pickup_location: body.pickup_location || 'West Loop Central Depot',
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        destination: body.destination || 'Oak Brook Commercial Hub',
        dest_lat: destLat,
        dest_lng: destLng,
        package_weight_kg: packageWeight,
        required_capacity_kg: requiredCap,
        deadline_mins: deadlineMins,
        deadline_label: deadlineLabel,
        assigned_vehicle_id: assignedVehicleId,
        status: body.status || (assignedVehicleId ? 'Assigned' : 'Pending'),
        estimated_distance_km: distKm,
        estimated_time_mins: timeMins,
        priority: body.priority || 'Standard',
        sequence_order: Number(body.sequence_order) || 1,
        route_corridor: body.route_corridor || 'I-290 Westbound Corridor',
        updated_at: now,
      });

      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: err.message || 'Failed to create delivery' });
    }
  });

  // 4. Update Delivery (including vehicle assignment & status updates with constraint validation)
  app.put('/api/deliveries/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getDeliveryById(id);
      if (!existing) {
        return res.status(404).json({ error: `Delivery ${id} not found.` });
      }

      const body = req.body;
      const packageWeight =
        body.package_weight_kg !== undefined
          ? Number(body.package_weight_kg)
          : existing.package_weight_kg;
      const requiredCap =
        body.required_capacity_kg !== undefined
          ? Number(body.required_capacity_kg)
          : existing.required_capacity_kg;
      const newVehicleId =
        body.assigned_vehicle_id !== undefined
          ? body.assigned_vehicle_id
          : existing.assigned_vehicle_id;

      if (newVehicleId) {
        const v = await getVehicleById(newVehicleId);
        if (!v) {
          return res
            .status(400)
            .json({ error: `Vehicle ${newVehicleId} not found.` });
        }
        if (
          v.status === 'Breakdown' ||
          v.status === 'Maintenance' ||
          v.availability !== 'Available'
        ) {
          return res.status(400).json({
            error: `Constraint Violation: Vehicle ${v.id} is unavailable (${v.status}). Select an available vehicle.`,
          });
        }
        if (v.max_capacity_kg < requiredCap) {
          return res.status(400).json({
            error: `Constraint Violation: Vehicle ${v.id} maximum capacity (${v.max_capacity_kg} kg) is below required capacity (${requiredCap} kg).`,
          });
        }

        const currentState = await getFullSystemState();
        const otherLoad = currentState.deliveries
          .filter(
            (d) =>
              d.assigned_vehicle_id === newVehicleId &&
              d.id !== id &&
              d.status !== 'Delivered'
          )
          .reduce((sum, d) => sum + d.package_weight_kg, 0);

        const remainingCap = v.max_capacity_kg - otherLoad;

        if (packageWeight > remainingCap) {
          return res.status(400).json({
            error: `Capacity Constraint Violation: Vehicle ${v.id} has ${remainingCap} kg available capacity (${otherLoad}/${v.max_capacity_kg} kg loaded), which cannot accommodate ${packageWeight} kg.`,
          });
        }
      }

      const pickupLat =
        body.pickup_lat !== undefined
          ? Number(body.pickup_lat)
          : existing.pickup_lat;
      const pickupLng =
        body.pickup_lng !== undefined
          ? Number(body.pickup_lng)
          : existing.pickup_lng;
      const destLat =
        body.dest_lat !== undefined ? Number(body.dest_lat) : existing.dest_lat;
      const destLng =
        body.dest_lng !== undefined ? Number(body.dest_lng) : existing.dest_lng;

      const distKm =
        body.estimated_distance_km !== undefined
          ? Number(body.estimated_distance_km)
          : calculateRoadDistanceKm(
              pickupLat,
              pickupLng,
              destLat,
              destLng,
              1.28
            );

      const timeMins =
        body.estimated_time_mins !== undefined
          ? Number(body.estimated_time_mins)
          : existing.estimated_time_mins;

      const updatedStatus =
        body.status !== undefined
          ? body.status
          : newVehicleId && existing.status === 'Pending'
          ? 'Assigned'
          : existing.status;

      const now = new Date().toISOString();

      await updateDeliveryRecord(id, {
        pickup_location: body.pickup_location ?? existing.pickup_location,
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        destination: body.destination ?? existing.destination,
        dest_lat: destLat,
        dest_lng: destLng,
        package_weight_kg: packageWeight,
        required_capacity_kg: requiredCap,
        deadline_mins:
          body.deadline_mins !== undefined
            ? Number(body.deadline_mins)
            : existing.deadline_mins,
        deadline_label: body.deadline_label ?? existing.deadline_label,
        assigned_vehicle_id: newVehicleId,
        status: updatedStatus,
        estimated_distance_km: distKm,
        estimated_time_mins: timeMins,
        priority: body.priority ?? existing.priority,
        sequence_order:
          body.sequence_order !== undefined
            ? Number(body.sequence_order)
            : existing.sequence_order,
        route_corridor: body.route_corridor ?? existing.route_corridor,
        updated_at: now,
      });

      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: err.message || 'Failed to update delivery' });
    }
  });

  // 5. Delete Delivery
  app.delete('/api/deliveries/:id', async (req, res) => {
    try {
      await deleteDeliveryRecord(req.params.id);
      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: err.message || 'Failed to delete delivery' });
    }
  });

  // 6. Create Vehicle
  app.post('/api/vehicles', async (req, res) => {
    try {
      const body = req.body;
      const id = body.id?.trim() || `V-0${Math.floor(6 + Math.random() * 90)}`;
      const status = body.status || 'Available';
      const availability =
        status === 'Breakdown' || status === 'Maintenance'
          ? 'Unavailable'
          : body.availability || 'Available';
      const now = new Date().toISOString();

      await insertVehicleRecord({
        id,
        name: body.name || `${body.type || 'Cargo Van'} ${id}`,
        type: body.type || 'Medium Cargo Van',
        max_capacity_kg: Number(body.max_capacity_kg) || 900,
        current_load_kg: 0,
        availability,
        location_name: body.location_name || 'West Loop Central Depot',
        lat: Number(body.lat) || 41.8825,
        lng: Number(body.lng) || -87.6542,
        cost_per_km: Number(body.cost_per_km) || 1.55,
        speed_kmh: Number(body.speed_kmh) || 58,
        status,
        updated_at: now,
      });

      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to add vehicle' });
    }
  });

  // 7. Update Vehicle
  app.put('/api/vehicles/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getVehicleById(id);
      if (!existing) {
        return res.status(404).json({ error: `Vehicle ${id} not found.` });
      }
      const body = req.body;
      const newStatus = body.status ?? existing.status;
      const newAvailability =
        newStatus === 'Breakdown' || newStatus === 'Maintenance'
          ? 'Unavailable'
          : body.availability ?? 'Available';
      const now = new Date().toISOString();

      await updateVehicleRecord(id, {
        name: body.name ?? existing.name,
        type: body.type ?? existing.type,
        max_capacity_kg:
          body.max_capacity_kg !== undefined
            ? Number(body.max_capacity_kg)
            : existing.max_capacity_kg,
        availability: newAvailability,
        location_name: body.location_name ?? existing.location_name,
        lat: body.lat !== undefined ? Number(body.lat) : existing.lat,
        lng: body.lng !== undefined ? Number(body.lng) : existing.lng,
        cost_per_km:
          body.cost_per_km !== undefined
            ? Number(body.cost_per_km)
            : existing.cost_per_km,
        speed_kmh:
          body.speed_kmh !== undefined
            ? Number(body.speed_kmh)
            : existing.speed_kmh,
        status: newStatus,
        updated_at: now,
      });

      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: err.message || 'Failed to update vehicle' });
    }
  });

  // 8. Delete Vehicle
  app.delete('/api/vehicles/:id', async (req, res) => {
    try {
      await deleteVehicleRecord(req.params.id);
      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: err.message || 'Failed to delete vehicle' });
    }
  });

  // 9. Initiate Disruption Analysis & Recovery Plan Generation
  app.post('/api/disruptions/analyze', async (req, res) => {
    try {
      const {
        type = 'Vehicle Breakdown',
        target_id = 'V-03',
        description,
      }: {
        type: DisruptionType;
        target_id: string;
        description?: string;
      } = req.body;

      const preDisruptionState = await getFullSystemState();
      const snapshot: DisruptionSnapshot = {
        deliveries: preDisruptionState.deliveries,
        vehicles: preDisruptionState.vehicles,
        settings: preDisruptionState.settings,
      };

      const now = new Date().toISOString();
      const disruptionId = `DISR-${Date.now().toString().slice(-5)}`;

      let affectedDeliveries: Delivery[] = [];
      let title = '';
      let defaultDesc = '';
      let severity: 'Critical' | 'High' | 'Moderate' = 'Critical';

      if (type === 'Vehicle Breakdown') {
        const vehicle = preDisruptionState.vehicles.find(
          (v) => v.id === target_id
        );
        if (!vehicle) {
          return res
            .status(400)
            .json({ error: `Vehicle ${target_id} not found.` });
        }

        await updateVehicleRecord(target_id, {
          status: 'Breakdown',
          availability: 'Unavailable',
          updated_at: now,
        });

        affectedDeliveries = preDisruptionState.deliveries.filter(
          (d) => d.assigned_vehicle_id === target_id && d.status !== 'Delivered'
        );

        for (const d of affectedDeliveries) {
          await updateDeliveryRecord(d.id, {
            status: 'At Risk',
            updated_at: now,
          });
        }

        title = `Vehicle ${target_id} Breakdown (${vehicle.location_name})`;
        defaultDesc = `Vehicle ${target_id} (${vehicle.type}) experienced an unexpected mechanical breakdown at ${vehicle.location_name} while carrying ${affectedDeliveries.length} active delivery orders (${affectedDeliveries.map((d) => d.id).join(', ')}; ${affectedDeliveries.reduce((s, d) => s + d.package_weight_kg, 0)} kg total payload).`;
        severity = 'Critical';
      } else if (type === 'Vehicle Capacity Unavailability') {
        const vehicle = preDisruptionState.vehicles.find(
          (v) => v.id === target_id
        );
        if (!vehicle) {
          return res
            .status(400)
            .json({ error: `Vehicle ${target_id} not found.` });
        }

        const reducedCap = Math.max(
          300,
          Math.round(vehicle.max_capacity_kg * 0.5)
        );
        await updateVehicleRecord(target_id, {
          max_capacity_kg: reducedCap,
          updated_at: now,
        });

        const vehOrders = preDisruptionState.deliveries.filter(
          (d) => d.assigned_vehicle_id === target_id && d.status !== 'Delivered'
        );
        let runningLoad = 0;
        for (const order of vehOrders) {
          if (runningLoad + order.package_weight_kg <= reducedCap) {
            runningLoad += order.package_weight_kg;
          } else {
            affectedDeliveries.push(order);
          }
        }
        if (affectedDeliveries.length === 0 && vehOrders.length > 0) {
          affectedDeliveries = [vehOrders[vehOrders.length - 1]];
        }

        for (const d of affectedDeliveries) {
          await updateDeliveryRecord(d.id, {
            status: 'At Risk',
            updated_at: now,
          });
        }

        title = `Vehicle ${target_id} Capacity Unavailability (${reducedCap} kg Limit)`;
        defaultDesc = `Compartment/weight restriction on ${target_id} reduced rated capacity to ${reducedCap} kg, requiring ${affectedDeliveries.length} overflow deliveries (${affectedDeliveries.map((d) => d.id).join(', ')}) to be reassigned to other available vehicles.`;
        severity = 'High';
      } else if (type === 'Route Closure' || type === 'Route Disruption') {
        affectedDeliveries = preDisruptionState.deliveries.filter(
          (d) => d.route_corridor === target_id && d.status !== 'Delivered'
        );
        if (affectedDeliveries.length === 0) {
          affectedDeliveries = preDisruptionState.deliveries.filter(
            (d) =>
              ['DEL-105', 'DEL-106', 'DEL-107'].includes(d.id) &&
              d.status !== 'Delivered'
          );
        }
        for (const d of affectedDeliveries) {
          await updateDeliveryRecord(d.id, {
            status: 'At Risk',
            updated_at: now,
          });
        }
        title = `Route Closure — ${target_id}`;
        defaultDesc = `Full corridor closure along ${target_id} impacts ${affectedDeliveries.length} active shipments (${affectedDeliveries.map((d) => d.id).join(', ')}). Evaluating detour routes (+24% travel time) and replacement vehicle assignments.`;
        severity = 'High';
      } else if (type === 'Traffic Congestion') {
        affectedDeliveries = preDisruptionState.deliveries.filter(
          (d) =>
            (d.route_corridor === target_id ||
              d.assigned_vehicle_id === target_id) &&
            d.status !== 'Delivered'
        );
        if (affectedDeliveries.length === 0) {
          affectedDeliveries = preDisruptionState.deliveries.filter(
            (d) => d.priority === 'Critical' && d.status !== 'Delivered'
          );
        }
        for (const d of affectedDeliveries) {
          await updateDeliveryRecord(d.id, {
            status: 'At Risk',
            updated_at: now,
          });
        }
        title = `Severe Traffic Congestion — ${target_id}`;
        defaultDesc = `Heavy corridor congestion (+35% travel time penalty) impacting ${affectedDeliveries.map((d) => d.id).join(', ')}. Evaluating faster alternate vehicle assignments.`;
        severity = 'Moderate';
      } else {
        affectedDeliveries = preDisruptionState.deliveries.filter(
          (d) =>
            (d.id === target_id ||
              d.assigned_vehicle_id === target_id ||
              d.status === 'Pending') &&
            d.status !== 'Delivered'
        );
        if (affectedDeliveries.length === 0) {
          affectedDeliveries = preDisruptionState.deliveries.slice(0, 2);
        }
        for (const d of affectedDeliveries) {
          await updateDeliveryRecord(d.id, {
            status: 'Delayed',
            updated_at: now,
          });
        }
        title = `Unexpected Delivery Delay — ${target_id}`;
        defaultDesc = `Unexpected dock delay and SLA window compression affecting ${affectedDeliveries.map((d) => d.id).join(', ')}.`;
        severity = 'High';
      }

      const updatedState = await getFullSystemState();
      const refreshedAffected = updatedState.deliveries.filter((d) =>
        affectedDeliveries.some((ad) => ad.id === d.id)
      );
      const unaffectedIds = updatedState.deliveries
        .filter((d) => !refreshedAffected.some((ad) => ad.id === d.id))
        .map((d) => d.id);

      const generatedPlans = generateDisruptionRecoveryPlans({
        disruptionId,
        disruptionType: type,
        targetId: target_id,
        affectedDeliveries: refreshedAffected,
        allVehicles: updatedState.vehicles,
        allDeliveries: updatedState.deliveries,
        settings: updatedState.settings,
      });

      await saveDisruptionAndPlans({
        disruptionRow: {
          id: disruptionId,
          type,
          target_id,
          title,
          description: description?.trim() || defaultDesc,
          severity,
          affected_delivery_ids: JSON.stringify(
            refreshedAffected.map((d) => d.id)
          ),
          unaffected_delivery_ids: JSON.stringify(unaffectedIds),
          status: 'Active',
          selected_plan_id: null,
          dispatcher_decision: 'Awaiting Dispatcher Approval',
          snapshot_json: JSON.stringify(snapshot),
          created_at: now,
          resolved_at: null,
        },
        generatedPlans,
      });

      const finalState = await getFullSystemState();
      res.json({
        disruption_id: disruptionId,
        plans: generatedPlans,
        state: finalState,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || 'Disruption analysis failed' });
    }
  });

  // 10. Approve Recovery Plan
  app.post('/api/plans/:id/approve', async (req, res) => {
    try {
      const { id } = req.params;
      const approvedBy = req.body.approved_by || 'Dispatcher (Operations Desk)';
      const state = await getFullSystemState();

      const plan = state.plans.find((p) => p.id === id);
      if (!plan) {
        return res
          .status(404)
          .json({ error: `Optimization plan ${id} not found.` });
      }
      if (!plan.feasible || plan.assignments.length === 0) {
        return res.status(400).json({
          error: `Cannot approve infeasible plan: ${plan.infeasibility_reason || 'No valid assignments.'}`,
        });
      }

      const seenDeliveryIds = new Set<string>();
      for (const item of plan.assignments) {
        if (seenDeliveryIds.has(item.delivery_id)) {
          return res.status(400).json({
            error: `Data Integrity Error: Duplicate assignment detected for delivery ${item.delivery_id}.`,
          });
        }
        seenDeliveryIds.add(item.delivery_id);
      }

      const projectedVehicleLoads = new Map<string, number>();
      for (const v of state.vehicles) {
        const nonAffectedLoad = state.deliveries
          .filter(
            (d) =>
              d.assigned_vehicle_id === v.id &&
              d.status !== 'Delivered' &&
              !seenDeliveryIds.has(d.id)
          )
          .reduce((sum, d) => sum + d.package_weight_kg, 0);
        projectedVehicleLoads.set(v.id, nonAffectedLoad);
      }

      for (const item of plan.assignments) {
        const targetVeh = state.vehicles.find(
          (v) => v.id === item.assigned_vehicle_id
        );
        if (!targetVeh) {
          return res.status(400).json({
            error: `Data Integrity Error: Assigned vehicle ${item.assigned_vehicle_id} does not exist.`,
          });
        }
        if (
          targetVeh.status === 'Breakdown' ||
          targetVeh.status === 'Maintenance' ||
          targetVeh.availability !== 'Available'
        ) {
          return res.status(400).json({
            error: `Data Integrity Error: Vehicle ${targetVeh.id} is unavailable (${targetVeh.status}) and cannot be assigned.`,
          });
        }
        const newLoad =
          (projectedVehicleLoads.get(targetVeh.id) || 0) +
          item.package_weight_kg;
        if (newLoad > targetVeh.max_capacity_kg) {
          return res.status(400).json({
            error: `Data Integrity Error: Approving ${plan.plan_code} would exceed ${targetVeh.id} maximum capacity (${newLoad}/${targetVeh.max_capacity_kg} kg).`,
          });
        }
        projectedVehicleLoads.set(targetVeh.id, newLoad);
      }

      const disruption = state.disruptions.find(
        (d) => d.id === plan.disruption_id
      );
      const now = new Date().toISOString();

      const origDistanceKm = Number(
        plan.assignments
          .reduce((s, a) => s + a.baseline_distance_km, 0)
          .toFixed(1)
      );
      const origCostUsd = Number(
        plan.assignments.reduce((s, a) => s + a.baseline_cost_usd, 0).toFixed(2)
      );
      const totalMaxCap = state.vehicles.reduce(
        (s, v) => s + v.max_capacity_kg,
        0
      );
      const totalCurrentLoad = state.vehicles.reduce(
        (s, v) => s + v.current_load_kg,
        0
      );
      const origUtilPct = Math.round(
        (totalCurrentLoad / Math.max(totalMaxCap, 1)) * 100
      );

      await persistApprovedPlanExecution({
        plan,
        disruption,
        approvedBy,
        now,
        origCostUsd,
        origDistanceKm,
        origUtilPct,
      });

      const updatedState = await getFullSystemState();
      res.json({
        message: `Approved ${plan.plan_code} (${plan.plan_name}). Updated ${plan.assignments.length} affected deliveries; 0 unaffected assignments changed.`,
        state: updatedState,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || 'Failed to approve plan' });
    }
  });

  // 11. Reject Recovery Plan
  app.post('/api/plans/:id/reject', async (req, res) => {
    try {
      await rejectOptimizationPlanById(req.params.id);
      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(400)
        .json({ error: err.message || 'Failed to reject plan' });
    }
  });

  // 12. Scenario Replay: Restore Initial Assignments from Recorded Disruption Snapshot
  app.post('/api/disruptions/:id/restore-snapshot', async (req, res) => {
    try {
      const { id } = req.params;
      const row = await getDisruptionById(id);
      if (!row || !row.snapshot_json) {
        return res.status(404).json({
          error: `No recorded initial snapshot found for disruption ${id}.`,
        });
      }
      const snapshot: DisruptionSnapshot = JSON.parse(row.snapshot_json);
      await restoreSnapshotToDatabase(snapshot);

      const state = await getFullSystemState();
      res.json({
        message: `Restored initial pre-disruption delivery and fleet assignments from ${id}.`,
        state,
      });
    } catch (err: any) {
      res.status(500).json({
        error: err.message || 'Failed to restore scenario snapshot',
      });
    }
  });

  // 13. Scenario Replay: Restore Snapshot & Re-Run Optimization for Side-by-Side Comparison
  app.post('/api/disruptions/:id/replay', async (req, res) => {
    try {
      const { id } = req.params;
      const row = await getDisruptionById(id);
      if (!row || !row.snapshot_json) {
        return res.status(404).json({
          error: `Disruption ${id} does not have a saved snapshot to replay.`,
        });
      }

      const snapshot: DisruptionSnapshot = JSON.parse(row.snapshot_json);
      const currentSettings = await getAppSettings();

      await restoreSnapshotToDatabase(snapshot);

      const now = new Date().toISOString();
      const targetId = row.target_id;
      const type = row.type as DisruptionType;
      const affectedIds: string[] = JSON.parse(
        row.affected_delivery_ids || '[]'
      );

      if (type === 'Vehicle Breakdown') {
        await updateVehicleRecord(targetId, {
          status: 'Breakdown',
          availability: 'Unavailable',
          updated_at: now,
        });
      } else if (type === 'Vehicle Capacity Unavailability') {
        const v = snapshot.vehicles.find((veh) => veh.id === targetId);
        if (v) {
          const reducedCap = Math.max(
            300,
            Math.round(v.max_capacity_kg * 0.5)
          );
          await updateVehicleRecord(targetId, {
            max_capacity_kg: reducedCap,
            updated_at: now,
          });
        }
      }

      for (const delId of affectedIds) {
        await updateDeliveryRecord(delId, {
          status: 'At Risk',
          updated_at: now,
        });
      }

      const refreshedState = await getFullSystemState();
      const affectedDeliveries = refreshedState.deliveries.filter((d) =>
        affectedIds.includes(d.id)
      );

      const replayedPlans = generateDisruptionRecoveryPlans({
        disruptionId: id,
        disruptionType: type,
        targetId,
        affectedDeliveries,
        allVehicles: refreshedState.vehicles,
        allDeliveries: refreshedState.deliveries,
        settings: currentSettings,
      });

      res.json({
        message: `Replayed ${id} from initial snapshot and recomputed Plan A, Plan B, and Plan C.`,
        replayed_plans: replayedPlans,
        previous_plans: refreshedState.plans.filter(
          (p) => p.disruption_id === id
        ),
        recorded_decision: row.dispatcher_decision || 'No Decision Recorded',
        state: refreshedState,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || 'Scenario replay failed' });
    }
  });

  // 14. Run Controlled Research Experiment Scenario
  app.post('/api/experiments/run', async (req, res) => {
    try {
      const { scenario_code = 'SCEN_1_BREAKDOWN' } = req.body;
      const state = await getFullSystemState();

      const exp = runControlledExperimentScenario({
        scenarioCode: scenario_code,
        deliveries: state.deliveries,
        vehicles: state.vehicles,
        settings: state.settings,
      });

      await insertExperimentRecord(exp);
      const updatedState = await getFullSystemState();

      res.json({
        experiment: exp,
        state: updatedState,
      });
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || 'Failed to run experiment' });
    }
  });

  // 15. Clear Experiment History
  app.delete('/api/experiments', async (_req, res) => {
    try {
      await clearExperimentRecords();
      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res
        .status(500)
        .json({ error: err.message || 'Failed to clear experiments' });
    }
  });

  // 16. Update Settings
  app.put('/api/settings', async (req, res) => {
    try {
      await upsertSettingsRecords(req.body || {});
      const state = await getFullSystemState();
      res.json(state);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save settings' });
    }
  });

  // 17. Multi-Turn Gemini Chatbot
  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { message, history, model, persona } = req.body;
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message text is required.' });
      }
      const result = await runMultiTurnChat({
        message,
        history: Array.isArray(history) ? history : [],
        model,
        persona,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error:
          err.message ||
          'Gemini chat request failed. Check your API key in Settings > Secrets.',
      });
    }
  });

  // 18. Google Maps Grounding
  app.post('/api/ai/maps-grounding', async (req, res) => {
    try {
      const { query, latitude, longitude } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Maps query is required.' });
      }
      const result = await runGoogleMapsGrounding({
        query,
        latitude: typeof latitude === 'number' ? latitude : undefined,
        longitude: typeof longitude === 'number' ? longitude : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error:
          err.message ||
          'Google Maps grounding request failed. Check Settings > Secrets.',
      });
    }
  });

  // 19. Google Search Grounding
  app.post('/api/ai/search-grounding', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'Search query is required.' });
      }
      const result = await runGoogleSearchGrounding({ query });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error:
          err.message ||
          'Google Search grounding request failed. Check Settings > Secrets.',
      });
    }
  });

  // 20. Lyria Music Generation
  app.post('/api/ai/music', async (req, res) => {
    try {
      const { prompt, model } = req.body;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Music prompt is required.' });
      }
      const result = await runLyriaMusicGeneration({ prompt, model });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error:
          err.message ||
          'Lyria music generation failed. Ensure a billing-enabled API key is configured in Settings > Secrets.',
      });
    }
  });

  // 21. Priority 1: OpenRouteService Multi-Stop Directions Proxy
  app.post('/api/ors/directions', async (req, res) => {
    try {
      const { coordinates } = req.body;
      if (!Array.isArray(coordinates) || coordinates.length < 2) {
        return res.status(400).json({
          error:
            'Please provide an array of at least 2 [longitude, latitude] coordinate pairs.',
        });
      }
      const routeData = await calculateRoute(coordinates);
      res.json(routeData);
    } catch (err: any) {
      res.status(500).json({
        error: err.message || 'OpenRouteService directions calculation failed.',
      });
    }
  });

  // 22. Priority 2: Gemini Disruption Recovery Incident Report Proxy
  app.post('/api/ai/disruption-recovery', async (req, res) => {
    try {
      const { incident, currentRoute } = req.body;
      if (!incident || !incident.type) {
        return res
          .status(400)
          .json({ error: 'Incident type and location are required.' });
      }
      const result = await generateDisruptionRecovery(
        incident,
        currentRoute || { summary: {} }
      );
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        error: err.message || 'Gemini disruption recovery report failed.',
      });
    }
  });

  // 23. Priority 3: OpenStreetMap Nominatim Geocoding Proxy (Rate-Limited 1 req/sec)
  app.get('/api/osm/geocode', async (req, res) => {
    try {
      const query = String(req.query.q || '').trim();
      if (!query) {
        return res.status(400).json({ error: 'Query parameter q is required.' });
      }
      const places = await geocodeWithNominatim(query);
      res.json({ places });
    } catch (err: any) {
      res.status(500).json({
        error: err.message || 'Nominatim geocoding request failed.',
      });
    }
  });

  // 24. Priority 4A: Open-Meteo Real-Time Corridor Weather Disruption Proxy
  app.get('/api/weather/disruption', async (req, res) => {
    try {
      const lat = Number(req.query.lat ?? 41.8736);
      const lng = Number(req.query.lng ?? -87.7915);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res
          .status(400)
          .json({ error: 'Valid numeric lat and lng parameters are required.' });
      }
      const weather = await fetchCorridorWeatherDisruption(lat, lng);
      res.json(weather);
    } catch (err: any) {
      res.status(500).json({
        error: err.message || 'Open-Meteo weather disruption fetch failed.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LogiMind AI Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
