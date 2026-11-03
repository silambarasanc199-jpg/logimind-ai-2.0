import { relations } from 'drizzle-orm';
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

// 1. Users table linked to Firebase Auth UID
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  name: text('name').default('Elena Rostova'),
  role: text('role').default('Logistics Dispatcher'),
  facility: text('facility').default('Chicago Central Dispatch Hub'),
  createdAt: timestamp('created_at').defaultNow(),
});

// 2. Vehicles table
export const vehicles = pgTable('vehicles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  max_capacity_kg: integer('max_capacity_kg').notNull(),
  current_load_kg: integer('current_load_kg').notNull(),
  availability: text('availability').notNull(),
  location_name: text('location_name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  cost_per_km: doublePrecision('cost_per_km').notNull(),
  speed_kmh: integer('speed_kmh').notNull(),
  status: text('status').notNull(),
  updated_at: text('updated_at').notNull(),
});

// 3. Deliveries table
export const deliveries = pgTable('deliveries', {
  id: text('id').primaryKey(),
  pickup_location: text('pickup_location').notNull(),
  pickup_lat: doublePrecision('pickup_lat').notNull(),
  pickup_lng: doublePrecision('pickup_lng').notNull(),
  destination: text('destination').notNull(),
  dest_lat: doublePrecision('dest_lat').notNull(),
  dest_lng: doublePrecision('dest_lng').notNull(),
  package_weight_kg: integer('package_weight_kg').notNull(),
  required_capacity_kg: integer('required_capacity_kg').notNull(),
  deadline_mins: integer('deadline_mins').notNull(),
  deadline_label: text('deadline_label').notNull(),
  assigned_vehicle_id: text('assigned_vehicle_id'),
  status: text('status').notNull(),
  estimated_distance_km: doublePrecision('estimated_distance_km').notNull(),
  estimated_time_mins: integer('estimated_time_mins').notNull(),
  priority: text('priority').notNull(),
  sequence_order: integer('sequence_order').notNull(),
  route_corridor: text('route_corridor').notNull(),
  updated_at: text('updated_at').notNull(),
});

// 4. Disruptions table
export const disruptions = pgTable('disruptions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  target_id: text('target_id').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  severity: text('severity').notNull(),
  affected_delivery_ids: text('affected_delivery_ids').notNull(),
  unaffected_delivery_ids: text('unaffected_delivery_ids').default('[]'),
  status: text('status').notNull(),
  selected_plan_id: text('selected_plan_id'),
  dispatcher_decision: text('dispatcher_decision'),
  snapshot_json: text('snapshot_json'),
  created_at: text('created_at').notNull(),
  resolved_at: text('resolved_at'),
});

// 5. Optimization Plans table
export const optimizationPlans = pgTable('optimization_plans', {
  id: text('id').primaryKey(),
  disruption_id: text('disruption_id').notNull(),
  plan_code: text('plan_code').notNull(),
  plan_name: text('plan_name').notNull(),
  objective_summary: text('objective_summary').notNull(),
  assignments_json: text('assignments_json').notNull(),
  unassigned_deliveries_json: text('unassigned_deliveries_json').default('[]'),
  assigned_vehicles_json: text('assigned_vehicles_json').notNull(),
  orig_total_distance_km: doublePrecision('orig_total_distance_km').default(0),
  total_distance_km: doublePrecision('total_distance_km').notNull(),
  additional_distance_km: doublePrecision('additional_distance_km').notNull(),
  orig_total_time_mins: integer('orig_total_time_mins').default(0),
  total_time_mins: integer('total_time_mins').notNull(),
  additional_time_mins: integer('additional_time_mins').notNull(),
  total_delay_mins: integer('total_delay_mins').notNull(),
  orig_estimated_cost_usd: doublePrecision('orig_estimated_cost_usd').default(0),
  estimated_cost_usd: doublePrecision('estimated_cost_usd').notNull(),
  additional_cost_usd: doublePrecision('additional_cost_usd').notNull(),
  deliveries_recovered: integer('deliveries_recovered').notNull(),
  total_affected: integer('total_affected').notNull(),
  unaffected_deliveries_count: integer('unaffected_deliveries_count').default(0),
  unaffected_assignments_changed: integer('unaffected_assignments_changed').default(0),
  deadlines_met: integer('deadlines_met').notNull(),
  deadline_adherence_pct: integer('deadline_adherence_pct').default(100),
  orig_fleet_utilization_pct: integer('orig_fleet_utilization_pct').default(0),
  fleet_utilization_pct: integer('fleet_utilization_pct').notNull(),
  feasible: integer('feasible').notNull(),
  infeasibility_reason: text('infeasibility_reason'),
  explanation: text('explanation').notNull(),
  algorithm_steps_json: text('algorithm_steps_json').notNull(),
  is_recommended: integer('is_recommended').notNull(),
  status: text('status').notNull(),
  created_at: text('created_at').notNull(),
});

// 6. Approved Assignments table
export const approvedAssignments = pgTable('approved_assignments', {
  id: text('id').primaryKey(),
  disruption_id: text('disruption_id').notNull(),
  plan_id: text('plan_id').notNull(),
  plan_code: text('plan_code').notNull(),
  delivery_id: text('delivery_id').notNull(),
  previous_vehicle_id: text('previous_vehicle_id'),
  new_vehicle_id: text('new_vehicle_id').notNull(),
  distance_km: doublePrecision('distance_km').notNull(),
  travel_time_mins: integer('travel_time_mins').notNull(),
  operating_cost_usd: doublePrecision('operating_cost_usd').notNull(),
  deadline_met: integer('deadline_met').notNull(),
  approved_by: text('approved_by').notNull(),
  approved_at: text('approved_at').notNull(),
});

// 7. Experiments table
export const experiments = pgTable('experiments', {
  id: text('id').primaryKey(),
  scenario_code: text('scenario_code').notNull(),
  scenario_name: text('scenario_name').notNull(),
  description: text('description').notNull(),
  source_type: text('source_type').notNull(),
  disruption_type: text('disruption_type').notNull(),
  affected_deliveries_count: integer('affected_deliveries_count').notNull(),
  orig_cost_usd: doublePrecision('orig_cost_usd').notNull(),
  baseline_method_cost_usd: doublePrecision('baseline_method_cost_usd').default(0),
  recovery_cost_usd: doublePrecision('recovery_cost_usd').notNull(),
  cost_delta_pct: doublePrecision('cost_delta_pct').notNull(),
  orig_distance_km: doublePrecision('orig_distance_km').notNull(),
  baseline_method_distance_km: doublePrecision('baseline_method_distance_km').default(0),
  recovery_distance_km: doublePrecision('recovery_distance_km').notNull(),
  distance_delta_km: doublePrecision('distance_delta_km').notNull(),
  unmitigated_delay_mins: integer('unmitigated_delay_mins').notNull(),
  recovery_delay_mins: integer('recovery_delay_mins').notNull(),
  delay_reduction_mins: integer('delay_reduction_mins').notNull(),
  orig_utilization_pct: integer('orig_utilization_pct').notNull(),
  recovery_utilization_pct: integer('recovery_utilization_pct').notNull(),
  computation_time_ms: integer('computation_time_ms').notNull(),
  deadlines_met: integer('deadlines_met').notNull(),
  total_deadlines: integer('total_deadlines').notNull(),
  deadline_adherence_pct: integer('deadline_adherence_pct').default(100),
  feasible_assignments_count: integer('feasible_assignments_count').default(0),
  unaffected_assignments_changed: integer('unaffected_assignments_changed').default(0),
  selected_plan_name: text('selected_plan_name').notNull(),
  summary_findings: text('summary_findings').notNull(),
  created_at: text('created_at').notNull(),
});

// 8. Settings table
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// Relations
export const vehiclesRelations = relations(vehicles, ({ many }) => ({
  deliveries: many(deliveries),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  vehicle: one(vehicles, {
    fields: [deliveries.assigned_vehicle_id],
    references: [vehicles.id],
  }),
}));

export const disruptionsRelations = relations(disruptions, ({ many }) => ({
  plans: many(optimizationPlans),
  approvedAssignments: many(approvedAssignments),
}));

export const optimizationPlansRelations = relations(
  optimizationPlans,
  ({ one }) => ({
    disruption: one(disruptions, {
      fields: [optimizationPlans.disruption_id],
      references: [disruptions.id],
    }),
  })
);
