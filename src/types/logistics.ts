export type DeliveryStatus =
  | 'Pending'
  | 'Assigned'
  | 'In Transit'
  | 'At Risk'
  | 'Delivered'
  | 'Delayed';

export type DeliveryPriority = 'Critical' | 'High' | 'Standard';

export type VehicleStatus =
  | 'Available'
  | 'Assigned'
  | 'In Transit'
  | 'Maintenance'
  | 'Breakdown';

export type DisruptionType =
  | 'Vehicle Breakdown'
  | 'Route Closure'
  | 'Route Disruption'
  | 'Traffic Congestion'
  | 'Unexpected Delivery Delay'
  | 'Delivery Delay'
  | 'Vehicle Capacity Unavailability';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role:
    | 'Logistics Dispatcher'
    | 'Fleet Operations Manager'
    | 'Logistics Business Owner'
    | 'Delivery Operations Coordinator';
  facility: string;
}

export interface Delivery {
  id: string;
  pickup_location: string;
  pickup_lat: number;
  pickup_lng: number;
  destination: string;
  dest_lat: number;
  dest_lng: number;
  package_weight_kg: number;
  required_capacity_kg: number;
  deadline_mins: number;
  deadline_label: string;
  assigned_vehicle_id: string | null;
  status: DeliveryStatus;
  estimated_distance_km: number;
  estimated_time_mins: number;
  priority: DeliveryPriority;
  sequence_order: number;
  route_corridor: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  name: string;
  type:
    | 'Heavy Box Truck'
    | 'Medium Cargo Van'
    | 'Refrigerated Van'
    | 'Heavy Freight Sprinter'
    | 'Eco Express Van';
  max_capacity_kg: number;
  current_load_kg: number;
  availability: 'Available' | 'Unavailable';
  location_name: string;
  lat: number;
  lng: number;
  cost_per_km: number;
  speed_kmh: number;
  status: VehicleStatus;
  updated_at: string;
}

export interface RejectedVehicleExplanation {
  vehicle_id: string;
  vehicle_type: string;
  status: string;
  remaining_capacity_kg: number;
  max_capacity_kg: number;
  reason_category: 'Unavailable Status' | 'Capacity Exceeded' | 'Suboptimal Objective Score';
  explanation: string;
}

export interface PlanAssignmentItem {
  delivery_id: string;
  pickup_location: string;
  destination: string;
  package_weight_kg: number;
  required_capacity_kg: number;
  priority: DeliveryPriority;
  deadline_mins: number;
  deadline_label: string;
  previous_vehicle_id: string | null;
  assigned_vehicle_id: string;
  vehicle_name: string;
  vehicle_max_capacity_kg: number;
  vehicle_load_before_kg: number;
  vehicle_load_after_kg: number;
  deadhead_distance_km: number;
  delivery_distance_km: number;
  total_leg_distance_km: number;
  baseline_distance_km: number;
  additional_distance_km: number;
  route_deviation_km: number;
  estimated_travel_time_mins: number;
  baseline_time_mins: number;
  additional_time_mins: number;
  delay_over_deadline_mins: number;
  deadline_met: boolean;
  operating_cost_usd: number;
  baseline_cost_usd: number;
  additional_cost_usd: number;
  rationale: string;
  capacity_explanation: string;
  deadline_explanation: string;
  cost_distance_impact: string;
  rejected_vehicles: RejectedVehicleExplanation[];
}

export interface UnassignedDeliveryReason {
  delivery_id: string;
  destination: string;
  package_weight_kg: number;
  required_capacity_kg: number;
  deadline_label: string;
  reason: string;
  rejected_vehicles: RejectedVehicleExplanation[];
}

export interface OptimizationPlan {
  id: string;
  disruption_id: string;
  plan_code: 'Plan A' | 'Plan B' | 'Plan C';
  plan_name:
    | 'Minimum Cost'
    | 'Minimum Delay'
    | 'Balanced Recovery'
    | 'Minimum Estimated Cost'
    | 'Minimum Delivery Delay'
    | 'Balanced Optimization';
  objective_summary: string;
  assignments: PlanAssignmentItem[];
  unassigned_deliveries?: UnassignedDeliveryReason[];
  assigned_vehicles: string[];
  orig_total_distance_km?: number;
  total_distance_km: number;
  additional_distance_km: number;
  orig_total_time_mins?: number;
  total_time_mins: number;
  additional_time_mins: number;
  total_delay_mins: number;
  orig_estimated_cost_usd?: number;
  estimated_cost_usd: number;
  additional_cost_usd: number;
  deliveries_recovered: number;
  total_affected: number;
  unaffected_deliveries_count?: number;
  unaffected_assignments_changed?: number;
  deadlines_met: number;
  deadline_adherence_pct?: number;
  orig_fleet_utilization_pct?: number;
  fleet_utilization_pct: number;
  feasible: boolean;
  infeasibility_reason: string | null;
  explanation: string;
  algorithm_steps: string[];
  is_recommended: boolean;
  status: 'Proposed' | 'Approved' | 'Rejected';
  created_at: string;
}

export interface DisruptionSnapshot {
  deliveries: Delivery[];
  vehicles: Vehicle[];
  settings: AppSettings;
}

export interface DisruptionEvent {
  id: string;
  type: DisruptionType;
  target_id: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Moderate';
  affected_delivery_ids: string[];
  unaffected_delivery_ids?: string[];
  status: 'Active' | 'Resolved' | 'Dismissed';
  selected_plan_id: string | null;
  dispatcher_decision?: string | null;
  snapshot?: DisruptionSnapshot | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ApprovedAssignmentRecord {
  id: string;
  disruption_id: string;
  plan_id: string;
  plan_code: string;
  delivery_id: string;
  previous_vehicle_id: string | null;
  new_vehicle_id: string;
  distance_km: number;
  travel_time_mins: number;
  operating_cost_usd: number;
  deadline_met: boolean;
  approved_by: string;
  approved_at: string;
}

export interface ExperimentRecord {
  id: string;
  scenario_code: string;
  scenario_name: string;
  description: string;
  source_type: 'Operational Disruption Recovery' | 'Controlled Scenario Simulation';
  disruption_type: string;
  affected_deliveries_count: number;
  orig_cost_usd: number;
  baseline_method_cost_usd?: number;
  recovery_cost_usd: number;
  cost_delta_pct: number;
  orig_distance_km: number;
  baseline_method_distance_km?: number;
  recovery_distance_km: number;
  distance_delta_km: number;
  unmitigated_delay_mins: number;
  recovery_delay_mins: number;
  delay_reduction_mins: number;
  orig_utilization_pct: number;
  recovery_utilization_pct: number;
  computation_time_ms: number;
  deadlines_met: number;
  total_deadlines: number;
  deadline_adherence_pct?: number;
  feasible_assignments_count?: number;
  unaffected_assignments_changed?: number;
  selected_plan_name: string;
  summary_findings: string;
  created_at: string;
}

export interface AppSettings {
  dataset_label: string;
  road_tortuosity_factor: number;
  transfer_handover_mins: number;
  delay_penalty_per_min_usd: number;
  default_priority_weight: string;
  enforce_strict_capacity: boolean;
  auto_record_experiments: boolean;
}

export interface SystemStateResponse {
  deliveries: Delivery[];
  vehicles: Vehicle[];
  disruptions: DisruptionEvent[];
  plans: OptimizationPlan[];
  approved_assignments: ApprovedAssignmentRecord[];
  experiments: ExperimentRecord[];
  settings: AppSettings;
}
