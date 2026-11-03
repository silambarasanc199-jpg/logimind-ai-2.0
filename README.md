# LogiMind AI — Intelligent Logistics and Delivery Optimization

**Tagline:** *"Optimize Every Route. Recover From Every Disruption."*

LogiMind AI is a full-stack decision-support platform designed for small and medium-sized logistics operations and built for the **Threws Odyssey 2026 Research and Innovation Hackathon**. It enables dispatchers and fleet operations managers to manage active delivery schedules, respond to unexpected vehicle breakdowns and corridor disruptions, evaluate capacity-constrained replacement assignments, and minimize SLA delivery delays.

---

## 1. Core Capabilities

1. **Operations Dashboard**: Displays real-time database metrics (active deliveries, available vehicles, deliveries at risk, delayed orders, fleet utilization %, and estimated operational cost) alongside 4 analytical charts. Clearly labels the seeded benchmark as `Demo Dataset`.
2. **Delivery Management**: Full CRUD management for delivery orders (`DEL-101` to `DEL-110`) with real-time validation of vehicle availability and payload capacity constraints.
3. **Fleet Management**: Full CRUD management for fleet units (`V-01` to `V-05`) tracking max capacity, current load, free capacity, operating cost ($/km), average speed, and status (`Available`, `Assigned`, `In Transit`, `Maintenance`, `Breakdown`).
4. **Disruption Management (Core Product Differentiator)**:
   - Supports **Vehicle Breakdown**, **Route Disruption**, **Traffic Congestion**, and **Delivery Delay** events.
   - Automatically identifies affected deliveries, screens candidate replacement vehicles against hard capacity and availability constraints, calculates deadhead + delivery distances, and generates three distinct recovery plans:
     - **Plan A: Minimum Estimated Cost** (Greedy cost-per-km optimization)
     - **Plan B: Minimum Delivery Delay** (Parallel multi-vehicle dispatch for earliest arrival)
     - **Plan C: Balanced Optimization** (Multi-objective Pareto tradeoff across cost, SLA compliance, and capacity utilization)
   - Allows the dispatcher to approve a plan, updating **only** the affected deliveries and persisting the audit record.
5. **AI Optimization Center**: Side-by-side algorithmic matrix and visual comparison of Plan A, Plan B, and Plan C with step-by-step execution traces.
6. **Route Planning**: Interactive **OpenStreetMap + Leaflet** map displaying pickup locations, destinations, vehicle locations, deadhead connectors, and delivery sequences. Travel-time and distance values are explicitly labeled as **Calculated Estimates** (`Haversine × 1.28x road factor`).
7. **Analytics & Research Experimentation Module**: Evaluates Original Delivery Plan vs. Disruption Recovery Plan across cost, distance, delay saved, utilization, and solver time. Includes 5 controlled research scenarios (`SCEN_1_BREAKDOWN` through `SCEN_5_LIMITED_FLEET`) and CSV export, clearly distinguishing `"Controlled Scenario Simulation"` from `"Operational Disruption Recovery"`.

---

## 2. Reproducible Hackathon Demonstration Scenario

### Initial Deterministic State
- **10 Delivery Orders (`DEL-101` through `DEL-110`)**
- **5 Fleet Vehicles (`V-01` through `V-05`)**
- **Vehicle `V-03`** (`Medium Cargo Van`, `1000 kg` max capacity, `$1.60/km`) is in transit on the **I-290 Westbound Corridor** carrying **3 delivery orders**:
  - `DEL-105` (`280 kg`, Critical Priority, Oak Brook Regional Medical Center)
  - `DEL-106` (`260 kg`, High Priority, Downers Grove Precision Assembly)
  - `DEL-107` (`200 kg`, Standard Priority, Naperville West Logistics Terminal)

### Step-by-Step Walkthrough for Judges
1. Click **"Trigger V-03 Breakdown Scenario"** on the Dashboard or Top Bar.
2. LogiMind AI marks `V-03` as `Breakdown` (`Unavailable`) and flags only `DEL-105`, `DEL-106`, and `DEL-107` as `At Risk`.
3. The optimization engine screens available vehicles (`V-01` [520kg free], `V-02` [350kg free], `V-04` [1100kg free], `V-05` [440kg free]) and generates **Plan A**, **Plan B**, and **Plan C**.
4. Review the side-by-side comparison and click **"Approve Plan C"** (or Plan A / Plan B).
5. Verify that **only** `DEL-105`, `DEL-106`, and `DEL-107` are reassigned, while the other 7 orders remain untouched, and inspect the recorded metrics in **Analytics & Reports**.

---

## 3. Setup & Deployment Instructions

### Local Development
```bash
npm install
npm run dev
```
The full-stack Express + Vite + SQLite server runs on `http://localhost:3000` and persists all state in `logimind.db`.

### Production Build & Start
```bash
npm run build
NODE_ENV=production npm start
```
