import Database from 'better-sqlite3';
import path from 'path';
import {
  Delivery,
  Vehicle,
  DisruptionEvent,
  DisruptionSnapshot,
  OptimizationPlan,
  ApprovedAssignmentRecord,
  ExperimentRecord,
  AppSettings,
} from '../types/logistics.ts';
import { calculateRoadDistanceKm, calculateTravelTimeMins } from './optimizer.ts';

const dbPath = path.resolve(process.cwd(), 'logimind.db');
export const db = new Database(dbPath);

// Enable WAL mode for performance and concurrency
db.pragma('journal_mode = WAL');

function safeAddColumn(table: string, columnDef: string) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  } catch {
    // Column already exists
  }
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      max_capacity_kg INTEGER NOT NULL,
      current_load_kg INTEGER NOT NULL,
      availability TEXT NOT NULL,
      location_name TEXT NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      cost_per_km REAL NOT NULL,
      speed_kmh INTEGER NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      pickup_location TEXT NOT NULL,
      pickup_lat REAL NOT NULL,
      pickup_lng REAL NOT NULL,
      destination TEXT NOT NULL,
      dest_lat REAL NOT NULL,
      dest_lng REAL NOT NULL,
      package_weight_kg INTEGER NOT NULL,
      required_capacity_kg INTEGER NOT NULL,
      deadline_mins INTEGER NOT NULL,
      deadline_label TEXT NOT NULL,
      assigned_vehicle_id TEXT,
      status TEXT NOT NULL,
      estimated_distance_km REAL NOT NULL,
      estimated_time_mins INTEGER NOT NULL,
      priority TEXT NOT NULL,
      sequence_order INTEGER NOT NULL,
      route_corridor TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS disruptions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT NOT NULL,
      affected_delivery_ids TEXT NOT NULL,
      unaffected_delivery_ids TEXT DEFAULT '[]',
      status TEXT NOT NULL,
      selected_plan_id TEXT,
      dispatcher_decision TEXT,
      snapshot_json TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS optimization_plans (
      id TEXT PRIMARY KEY,
      disruption_id TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      objective_summary TEXT NOT NULL,
      assignments_json TEXT NOT NULL,
      unassigned_deliveries_json TEXT DEFAULT '[]',
      assigned_vehicles_json TEXT NOT NULL,
      orig_total_distance_km REAL DEFAULT 0,
      total_distance_km REAL NOT NULL,
      additional_distance_km REAL NOT NULL,
      orig_total_time_mins INTEGER DEFAULT 0,
      total_time_mins INTEGER NOT NULL,
      additional_time_mins INTEGER NOT NULL,
      total_delay_mins INTEGER NOT NULL,
      orig_estimated_cost_usd REAL DEFAULT 0,
      estimated_cost_usd REAL NOT NULL,
      additional_cost_usd REAL NOT NULL,
      deliveries_recovered INTEGER NOT NULL,
      total_affected INTEGER NOT NULL,
      unaffected_deliveries_count INTEGER DEFAULT 0,
      unaffected_assignments_changed INTEGER DEFAULT 0,
      deadlines_met INTEGER NOT NULL,
      deadline_adherence_pct INTEGER DEFAULT 100,
      orig_fleet_utilization_pct INTEGER DEFAULT 0,
      fleet_utilization_pct INTEGER NOT NULL,
      feasible INTEGER NOT NULL,
      infeasibility_reason TEXT,
      explanation TEXT NOT NULL,
      algorithm_steps_json TEXT NOT NULL,
      is_recommended INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS approved_assignments (
      id TEXT PRIMARY KEY,
      disruption_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      delivery_id TEXT NOT NULL,
      previous_vehicle_id TEXT,
      new_vehicle_id TEXT NOT NULL,
      distance_km REAL NOT NULL,
      travel_time_mins INTEGER NOT NULL,
      operating_cost_usd REAL NOT NULL,
      deadline_met INTEGER NOT NULL,
      approved_by TEXT NOT NULL,
      approved_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      scenario_code TEXT NOT NULL,
      scenario_name TEXT NOT NULL,
      description TEXT NOT NULL,
      source_type TEXT NOT NULL,
      disruption_type TEXT NOT NULL,
      affected_deliveries_count INTEGER NOT NULL,
      orig_cost_usd REAL NOT NULL,
      baseline_method_cost_usd REAL DEFAULT 0,
      recovery_cost_usd REAL NOT NULL,
      cost_delta_pct REAL NOT NULL,
      orig_distance_km REAL NOT NULL,
      baseline_method_distance_km REAL DEFAULT 0,
      recovery_distance_km REAL NOT NULL,
      distance_delta_km REAL NOT NULL,
      unmitigated_delay_mins INTEGER NOT NULL,
      recovery_delay_mins INTEGER NOT NULL,
      delay_reduction_mins INTEGER NOT NULL,
      orig_utilization_pct INTEGER NOT NULL,
      recovery_utilization_pct INTEGER NOT NULL,
      computation_time_ms INTEGER NOT NULL,
      deadlines_met INTEGER NOT NULL,
      total_deadlines INTEGER NOT NULL,
      deadline_adherence_pct INTEGER DEFAULT 100,
      feasible_assignments_count INTEGER DEFAULT 0,
      unaffected_assignments_changed INTEGER DEFAULT 0,
      selected_plan_name TEXT NOT NULL,
      summary_findings TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Safe schema migrations for existing SQLite databases
  safeAddColumn('disruptions', "unaffected_delivery_ids TEXT DEFAULT '[]'");
  safeAddColumn('disruptions', 'dispatcher_decision TEXT');
  safeAddColumn('disruptions', 'snapshot_json TEXT');

  safeAddColumn('optimization_plans', "unassigned_deliveries_json TEXT DEFAULT '[]'");
  safeAddColumn('optimization_plans', 'orig_total_distance_km REAL DEFAULT 0');
  safeAddColumn('optimization_plans', 'orig_total_time_mins INTEGER DEFAULT 0');
  safeAddColumn('optimization_plans', 'orig_estimated_cost_usd REAL DEFAULT 0');
  safeAddColumn('optimization_plans', 'unaffected_deliveries_count INTEGER DEFAULT 0');
  safeAddColumn('optimization_plans', 'unaffected_assignments_changed INTEGER DEFAULT 0');
  safeAddColumn('optimization_plans', 'deadline_adherence_pct INTEGER DEFAULT 100');
  safeAddColumn('optimization_plans', 'orig_fleet_utilization_pct INTEGER DEFAULT 0');

  safeAddColumn('experiments', 'baseline_method_cost_usd REAL DEFAULT 0');
  safeAddColumn('experiments', 'baseline_method_distance_km REAL DEFAULT 0');
  safeAddColumn('experiments', 'deadline_adherence_pct INTEGER DEFAULT 100');
  safeAddColumn('experiments', 'feasible_assignments_count INTEGER DEFAULT 0');
  safeAddColumn('experiments', 'unaffected_assignments_changed INTEGER DEFAULT 0');

  const countRow = db.prepare('SELECT COUNT(*) as count FROM vehicles').get() as {
    count: number;
  };
  if (countRow.count === 0) {
    seedDeterministicDemoDataset();
  }
}

export function seedDeterministicDemoDataset() {
  const now = '2026-11-03T08:30:00.000Z';

  const clearTx = db.transaction(() => {
    db.prepare('DELETE FROM approved_assignments').run();
    db.prepare('DELETE FROM optimization_plans').run();
    db.prepare('DELETE FROM disruptions').run();
    db.prepare('DELETE FROM experiments').run();
    db.prepare('DELETE FROM deliveries').run();
    db.prepare('DELETE FROM vehicles').run();
    db.prepare('DELETE FROM settings').run();

    // Seed 5 Delivery Vehicles (V-01 through V-05)
    const initialVehicles: Vehicle[] = [
      {
        id: 'V-01',
        name: 'Freightliner M2 Box 01',
        type: 'Heavy Box Truck',
        max_capacity_kg: 1200,
        current_load_kg: 680, // Carrying DEL-101 (380kg) + DEL-102 (300kg) -> 520kg free
        availability: 'Available',
        location_name: "O'Hare Logistics Hub",
        lat: 41.9742,
        lng: -87.9073,
        cost_per_km: 1.85,
        speed_kmh: 56,
        status: 'In Transit',
        updated_at: now,
      },
      {
        id: 'V-02',
        name: 'ThermoKing Transit 02',
        type: 'Refrigerated Van',
        max_capacity_kg: 900,
        current_load_kg: 550, // Carrying DEL-103 (310kg) + DEL-104 (240kg) -> 350kg free
        availability: 'Available',
        location_name: 'Cicero Distribution Center',
        lat: 41.8456,
        lng: -87.7539,
        cost_per_km: 1.5,
        speed_kmh: 60,
        status: 'Assigned',
        updated_at: now,
      },
      {
        id: 'V-03',
        name: 'Ford Transit Cargo 03',
        type: 'Medium Cargo Van',
        max_capacity_kg: 1000,
        current_load_kg: 740, // Carrying 3 orders: DEL-105 (280kg), DEL-106 (260kg), DEL-107 (200kg)
        availability: 'Available',
        location_name: 'I-290 Milepost 14 (Oak Park Corridor)',
        lat: 41.8736,
        lng: -87.7915,
        cost_per_km: 1.6,
        speed_kmh: 58,
        status: 'In Transit',
        updated_at: now,
      },
      {
        id: 'V-04',
        name: 'Mercedes Sprinter 3500XD',
        type: 'Heavy Freight Sprinter',
        max_capacity_kg: 1100,
        current_load_kg: 0, // Standby reserve vehicle at West Loop Depot -> 1100kg free
        availability: 'Available',
        location_name: 'West Loop Central Depot',
        lat: 41.8825,
        lng: -87.6542,
        cost_per_km: 1.75,
        speed_kmh: 62,
        status: 'Available',
        updated_at: now,
      },
      {
        id: 'V-05',
        name: 'Rivian EDV-700 Eco 05',
        type: 'Eco Express Van',
        max_capacity_kg: 650,
        current_load_kg: 210, // Carrying DEL-108 (210kg) -> 440kg free
        availability: 'Available',
        location_name: 'Skokie North Terminal',
        lat: 42.0324,
        lng: -87.7416,
        cost_per_km: 1.15,
        speed_kmh: 65,
        status: 'In Transit',
        updated_at: now,
      },
    ];

    const insertVehicle = db.prepare(`
      INSERT INTO vehicles (
        id, name, type, max_capacity_kg, current_load_kg, availability,
        location_name, lat, lng, cost_per_km, speed_kmh, status, updated_at
      ) VALUES (
        @id, @name, @type, @max_capacity_kg, @current_load_kg, @availability,
        @location_name, @lat, @lng, @cost_per_km, @speed_kmh, @status, @updated_at
      )
    `);
    for (const v of initialVehicles) {
      insertVehicle.run(v);
    }

    // Seed 10 Delivery Orders (DEL-101 through DEL-110)
    const rawDeliveries: Omit<
      Delivery,
      'estimated_distance_km' | 'estimated_time_mins'
    >[] = [
      {
        id: 'DEL-101',
        pickup_location: "O'Hare Logistics Hub",
        pickup_lat: 41.9742,
        pickup_lng: -87.9073,
        destination: 'Elk Grove Industrial Park',
        dest_lat: 42.0039,
        dest_lng: -87.9703,
        package_weight_kg: 380,
        required_capacity_kg: 800,
        deadline_mins: 90,
        deadline_label: '10:00 AM (90m)',
        assigned_vehicle_id: 'V-01',
        status: 'In Transit',
        priority: 'High',
        sequence_order: 1,
        route_corridor: 'I-90 Northwest Corridor',
        updated_at: now,
      },
      {
        id: 'DEL-102',
        pickup_location: "O'Hare Logistics Hub",
        pickup_lat: 41.9742,
        pickup_lng: -87.9073,
        destination: 'Schaumburg Commerce Center',
        dest_lat: 42.0334,
        dest_lng: -88.0834,
        package_weight_kg: 300,
        required_capacity_kg: 800,
        deadline_mins: 135,
        deadline_label: '10:45 AM (135m)',
        assigned_vehicle_id: 'V-01',
        status: 'Assigned',
        priority: 'Standard',
        sequence_order: 2,
        route_corridor: 'I-90 Northwest Corridor',
        updated_at: now,
      },
      {
        id: 'DEL-103',
        pickup_location: 'Cicero Distribution Center',
        pickup_lat: 41.8456,
        pickup_lng: -87.7539,
        destination: 'Midway Cold Storage Hub',
        dest_lat: 41.7868,
        dest_lng: -87.7522,
        package_weight_kg: 310,
        required_capacity_kg: 600,
        deadline_mins: 85,
        deadline_label: '09:55 AM (85m)',
        assigned_vehicle_id: 'V-02',
        status: 'Assigned',
        priority: 'Critical',
        sequence_order: 1,
        route_corridor: 'I-55 Southwest Corridor',
        updated_at: now,
      },
      {
        id: 'DEL-104',
        pickup_location: 'Cicero Distribution Center',
        pickup_lat: 41.8456,
        pickup_lng: -87.7539,
        destination: 'Burbank Medical Supply',
        dest_lat: 41.7445,
        dest_lng: -87.7701,
        package_weight_kg: 240,
        required_capacity_kg: 600,
        deadline_mins: 140,
        deadline_label: '10:50 AM (140m)',
        assigned_vehicle_id: 'V-02',
        status: 'Assigned',
        priority: 'Standard',
        sequence_order: 2,
        route_corridor: 'I-55 Southwest Corridor',
        updated_at: now,
      },
      // === THREE DELIVERIES ON V-03 (DEMO SCENARIO TARGETS) ===
      {
        id: 'DEL-105',
        pickup_location: 'I-290 Milepost 14 (Oak Park Transfer)',
        pickup_lat: 41.8736,
        pickup_lng: -87.7915,
        destination: 'Oak Brook Regional Medical Center',
        dest_lat: 41.8484,
        dest_lng: -87.9537,
        package_weight_kg: 280,
        required_capacity_kg: 600,
        deadline_mins: 75,
        deadline_label: '09:45 AM (75m)',
        assigned_vehicle_id: 'V-03',
        status: 'In Transit',
        priority: 'Critical',
        sequence_order: 1,
        route_corridor: 'I-290 Westbound Corridor',
        updated_at: now,
      },
      {
        id: 'DEL-106',
        pickup_location: 'I-290 Milepost 14 (Oak Park Transfer)',
        pickup_lat: 41.8736,
        pickup_lng: -87.7915,
        destination: 'Downers Grove Precision Assembly',
        dest_lat: 41.8089,
        dest_lng: -88.0112,
        package_weight_kg: 260,
        required_capacity_kg: 600,
        deadline_mins: 115,
        deadline_label: '10:25 AM (115m)',
        assigned_vehicle_id: 'V-03',
        status: 'In Transit',
        priority: 'High',
        sequence_order: 2,
        route_corridor: 'I-290 Westbound Corridor',
        updated_at: now,
      },
      {
        id: 'DEL-107',
        pickup_location: 'I-290 Milepost 14 (Oak Park Transfer)',
        pickup_lat: 41.8736,
        pickup_lng: -87.7915,
        destination: 'Naperville West Logistics Terminal',
        dest_lat: 41.7753,
        dest_lng: -88.1535,
        package_weight_kg: 200,
        required_capacity_kg: 500,
        deadline_mins: 155,
        deadline_label: '11:05 AM (155m)',
        assigned_vehicle_id: 'V-03',
        status: 'In Transit',
        priority: 'Standard',
        sequence_order: 3,
        route_corridor: 'I-290 Westbound Corridor',
        updated_at: now,
      },
      // === DELIVERIES ON V-05 & PENDING ===
      {
        id: 'DEL-108',
        pickup_location: 'Skokie North Terminal',
        pickup_lat: 42.0324,
        pickup_lng: -87.7416,
        destination: 'Evanston Biotech Campus',
        dest_lat: 42.0565,
        dest_lng: -87.6753,
        package_weight_kg: 210,
        required_capacity_kg: 500,
        deadline_mins: 65,
        deadline_label: '09:35 AM (65m)',
        assigned_vehicle_id: 'V-05',
        status: 'In Transit',
        priority: 'High',
        sequence_order: 1,
        route_corridor: 'I-94 North Shore Corridor',
        updated_at: now,
      },
      {
        id: 'DEL-109',
        pickup_location: 'West Loop Central Depot',
        pickup_lat: 41.8825,
        pickup_lng: -87.6542,
        destination: 'Chicago Loop Financial Tower',
        dest_lat: 41.8789,
        dest_lng: -87.6359,
        package_weight_kg: 190,
        required_capacity_kg: 500,
        deadline_mins: 45,
        deadline_label: '09:15 AM (Delivered)',
        assigned_vehicle_id: 'V-04',
        status: 'Delivered',
        priority: 'Standard',
        sequence_order: 1,
        route_corridor: 'Downtown Core Loop',
        updated_at: now,
      },
      {
        id: 'DEL-110',
        pickup_location: 'West Loop Central Depot',
        pickup_lat: 41.8825,
        pickup_lng: -87.6542,
        destination: 'Bridgeview Freight Annex',
        dest_lat: 41.7509,
        dest_lng: -87.8042,
        package_weight_kg: 320,
        required_capacity_kg: 650,
        deadline_mins: 180,
        deadline_label: '11:30 AM (180m)',
        assigned_vehicle_id: null,
        status: 'Pending',
        priority: 'Standard',
        sequence_order: 1,
        route_corridor: 'I-55 Southwest Corridor',
        updated_at: now,
      },
    ];

    const insertDelivery = db.prepare(`
      INSERT INTO deliveries (
        id, pickup_location, pickup_lat, pickup_lng, destination, dest_lat, dest_lng,
        package_weight_kg, required_capacity_kg, deadline_mins, deadline_label,
        assigned_vehicle_id, status, estimated_distance_km, estimated_time_mins,
        priority, sequence_order, route_corridor, updated_at
      ) VALUES (
        @id, @pickup_location, @pickup_lat, @pickup_lng, @destination, @dest_lat, @dest_lng,
        @package_weight_kg, @required_capacity_kg, @deadline_mins, @deadline_label,
        @assigned_vehicle_id, @status, @estimated_distance_km, @estimated_time_mins,
        @priority, @sequence_order, @route_corridor, @updated_at
      )
    `);

    for (const d of rawDeliveries) {
      const distKm = calculateRoadDistanceKm(
        d.pickup_lat,
        d.pickup_lng,
        d.dest_lat,
        d.dest_lng,
        1.28
      );
      const v = initialVehicles.find((veh) => veh.id === d.assigned_vehicle_id);
      const speed = v ? v.speed_kmh : 58;
      const timeMins = calculateTravelTimeMins(distKm, speed, 8, 1.0);
      insertDelivery.run({
        ...d,
        estimated_distance_km: distKm,
        estimated_time_mins: timeMins,
      });
    }

    const defaultSettings: AppSettings = {
      dataset_label:
        'Demo Dataset — Greater Chicago Metro Logistics Hub (Deterministic)',
      road_tortuosity_factor: 1.28,
      transfer_handover_mins: 8,
      delay_penalty_per_min_usd: 2.5,
      default_priority_weight: 'Critical > High > Standard (EDF)',
      enforce_strict_capacity: true,
      auto_record_experiments: true,
    };

    const insertSetting = db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?)'
    );
    for (const [k, val] of Object.entries(defaultSettings)) {
      insertSetting.run(k, JSON.stringify(val));
    }
  });

  clearTx();
}

export function restoreSnapshotToDatabase(snapshot: DisruptionSnapshot) {
  const restoreTx = db.transaction(() => {
    db.prepare('DELETE FROM deliveries').run();
    db.prepare('DELETE FROM vehicles').run();

    const insertVehicle = db.prepare(`
      INSERT INTO vehicles (
        id, name, type, max_capacity_kg, current_load_kg, availability,
        location_name, lat, lng, cost_per_km, speed_kmh, status, updated_at
      ) VALUES (
        @id, @name, @type, @max_capacity_kg, @current_load_kg, @availability,
        @location_name, @lat, @lng, @cost_per_km, @speed_kmh, @status, @updated_at
      )
    `);
    for (const v of snapshot.vehicles) {
      insertVehicle.run(v);
    }

    const insertDelivery = db.prepare(`
      INSERT INTO deliveries (
        id, pickup_location, pickup_lat, pickup_lng, destination, dest_lat, dest_lng,
        package_weight_kg, required_capacity_kg, deadline_mins, deadline_label,
        assigned_vehicle_id, status, estimated_distance_km, estimated_time_mins,
        priority, sequence_order, route_corridor, updated_at
      ) VALUES (
        @id, @pickup_location, @pickup_lat, @pickup_lng, @destination, @dest_lat, @dest_lng,
        @package_weight_kg, @required_capacity_kg, @deadline_mins, @deadline_label,
        @assigned_vehicle_id, @status, @estimated_distance_km, @estimated_time_mins,
        @priority, @sequence_order, @route_corridor, @updated_at
      )
    `);
    for (const d of snapshot.deliveries) {
      insertDelivery.run(d);
    }
  });

  restoreTx();
  recalcVehicleLoads();
}

export function recalcVehicleLoads() {
  const vehicles = db.prepare('SELECT * FROM vehicles').all() as Vehicle[];
  const activeDeliveries = db
    .prepare("SELECT * FROM deliveries WHERE status != 'Delivered'")
    .all() as Delivery[];

  const updateStmt = db.prepare(
    'UPDATE vehicles SET current_load_kg = ?, updated_at = ? WHERE id = ?'
  );
  const now = new Date().toISOString();

  for (const v of vehicles) {
    const load = activeDeliveries
      .filter((d) => d.assigned_vehicle_id === v.id)
      .reduce((sum, d) => sum + d.package_weight_kg, 0);
    updateStmt.run(load, now, v.id);
  }
}

export function getAppSettings(): AppSettings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const map: Record<string, unknown> = {};
  for (const r of rows) {
    try {
      map[r.key] = JSON.parse(r.value);
    } catch {
      map[r.key] = r.value;
    }
  }
  return {
    dataset_label:
      (map.dataset_label as string) ||
      'Demo Dataset — Greater Chicago Metro Logistics Hub (Deterministic)',
    road_tortuosity_factor: Number(map.road_tortuosity_factor) || 1.28,
    transfer_handover_mins: Number(map.transfer_handover_mins) || 8,
    delay_penalty_per_min_usd: Number(map.delay_penalty_per_min_usd) || 2.5,
    default_priority_weight:
      (map.default_priority_weight as string) ||
      'Critical > High > Standard (EDF)',
    enforce_strict_capacity:
      map.enforce_strict_capacity !== undefined
        ? Boolean(map.enforce_strict_capacity)
        : true,
    auto_record_experiments:
      map.auto_record_experiments !== undefined
        ? Boolean(map.auto_record_experiments)
        : true,
  };
}

export function getFullSystemState() {
  recalcVehicleLoads();
  const deliveries = db
    .prepare('SELECT * FROM deliveries ORDER BY id ASC')
    .all() as Delivery[];
  const vehicles = db
    .prepare('SELECT * FROM vehicles ORDER BY id ASC')
    .all() as Vehicle[];

  const rawDisruptions = db
    .prepare('SELECT * FROM disruptions ORDER BY created_at DESC')
    .all() as any[];
  const disruptions: DisruptionEvent[] = rawDisruptions.map((r) => ({
    ...r,
    affected_delivery_ids: JSON.parse(r.affected_delivery_ids || '[]'),
    unaffected_delivery_ids: JSON.parse(r.unaffected_delivery_ids || '[]'),
    snapshot: r.snapshot_json ? JSON.parse(r.snapshot_json) : null,
  }));

  const rawPlans = db
    .prepare(
      'SELECT * FROM optimization_plans ORDER BY created_at DESC, plan_code ASC'
    )
    .all() as any[];
  const plans: OptimizationPlan[] = rawPlans.map((p) => ({
    id: p.id,
    disruption_id: p.disruption_id,
    plan_code: p.plan_code,
    plan_name: p.plan_name,
    objective_summary: p.objective_summary,
    assignments: JSON.parse(p.assignments_json || '[]'),
    unassigned_deliveries: JSON.parse(p.unassigned_deliveries_json || '[]'),
    assigned_vehicles: JSON.parse(p.assigned_vehicles_json || '[]'),
    orig_total_distance_km: p.orig_total_distance_km || 0,
    total_distance_km: p.total_distance_km,
    additional_distance_km: p.additional_distance_km,
    orig_total_time_mins: p.orig_total_time_mins || 0,
    total_time_mins: p.total_time_mins,
    additional_time_mins: p.additional_time_mins,
    total_delay_mins: p.total_delay_mins,
    orig_estimated_cost_usd: p.orig_estimated_cost_usd || 0,
    estimated_cost_usd: p.estimated_cost_usd,
    additional_cost_usd: p.additional_cost_usd,
    deliveries_recovered: p.deliveries_recovered,
    total_affected: p.total_affected,
    unaffected_deliveries_count: p.unaffected_deliveries_count || 0,
    unaffected_assignments_changed: p.unaffected_assignments_changed || 0,
    deadlines_met: p.deadlines_met,
    deadline_adherence_pct: p.deadline_adherence_pct ?? 100,
    orig_fleet_utilization_pct: p.orig_fleet_utilization_pct || 0,
    fleet_utilization_pct: p.fleet_utilization_pct,
    feasible: Boolean(p.feasible),
    infeasibility_reason: p.infeasibility_reason,
    explanation: p.explanation,
    algorithm_steps: JSON.parse(p.algorithm_steps_json || '[]'),
    is_recommended: Boolean(p.is_recommended),
    status: p.status,
    created_at: p.created_at,
  }));

  const rawApproved = db
    .prepare('SELECT * FROM approved_assignments ORDER BY approved_at DESC')
    .all() as any[];
  const approved_assignments: ApprovedAssignmentRecord[] = rawApproved.map(
    (a) => ({
      ...a,
      deadline_met: Boolean(a.deadline_met),
    })
  );

  const experiments = db
    .prepare('SELECT * FROM experiments ORDER BY created_at DESC')
    .all() as ExperimentRecord[];

  const settings = getAppSettings();

  return {
    deliveries,
    vehicles,
    disruptions,
    plans,
    approved_assignments,
    experiments,
    settings,
  };
}
