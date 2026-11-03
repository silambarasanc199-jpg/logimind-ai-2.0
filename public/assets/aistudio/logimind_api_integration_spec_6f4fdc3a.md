# LogiMind AI — API Integration & Security Specification
**Hackathon:** Threws Odyssey 2026  
**System:** Intelligent Logistics and Delivery Optimization

---

## 1. Architectural Overview & Security Model

To protect proprietary data and comply with production security standards, **no API keys should ever be bundled into client-side JavaScript or checked into version control (git)**.

### Architecture Pattern: Backend Proxy Gateways
```
[Client / Browser (React/Vue/HTML)]
         │
         │ (Internal REST / WebSocket calls - No Keys)
         ▼
[LogiMind Backend (Node.js / Express or Python / FastAPI)]
    ├── Reads .env (process.env.OPENROUTESERVICE_API_KEY, GEMINI_API_KEY)
    ├── Validates input & rate-limits user sessions
    ├── Calls External APIs over server-to-server TLS
    └── Sanitizes & streams optimized results to Frontend
```

---

## 2. API Specifications

### Priority 1: OpenRouteService API
* **Provider:** HeiGIT (Heidelberg Institute for Geoinformation Technology)
* **Purpose:** Road routing, turn-by-turn directions, multi-point distance/duration matrices, and Vehicle Routing Problem (VRP) optimization.
* **Official Registration Link:** [OpenRouteService Sign Up](https://openrouteservice.org/dev/#/signup)
* **Official Dashboard Link:** [OpenRouteService Dashboard / Tokens](https://openrouteservice.org/dev/#/home)
* **API Key Generation Steps:**
  1. Register for an account at [openrouteservice.org/dev/#/signup](https://openrouteservice.org/dev/#/signup) and confirm your email.
  2. Log in and navigate to **Dashboard** -> **Tokens**.
  3. Under **Request a token**, choose Token type: `Standard`.
  4. Enter a Token name (e.g., `LogiMind-Hackathon-Core`) and click **Create Token**.
  5. Copy the generated hexadecimal string.
* **Billing Requirement:** None. No credit card required.
* **Free Tier Quotas & Limits:**
  * Directions: 2,000 requests/day, 40 requests/minute.
  * Distance Matrix: 500 requests/day, 40 requests/minute (max 2,500 pairs per call).
  * Route Optimization (Vroom VRP): 500 requests/day (up to 3 vehicles on the standard free plan).
* **Environment Variable:** `OPENROUTESERVICE_API_KEY`
* **Backend Endpoint Usage:**
  * Directions: `POST https://api.openrouteservice.org/v2/directions/driving-car/geojson`
  * Optimization (VRP): `POST https://api.openrouteservice.org/optimization`

---

### Priority 2: Google Gemini API
* **Provider:** Google DeepMind / Google AI Studio
* **Purpose:** Reasoning agent for breakdown/disruption recovery, automated logistics incident reports, and conversational explanation of routing choices.
* **Official Registration Link:** [Google AI Studio Sign In](https://aistudio.google.com/)
* **Official Dashboard Link:** [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)
* **API Key Generation Steps:**
  1. Navigate to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey).
  2. Sign in with your Google account.
  3. Click **Create API key**.
  4. Select an existing Google Cloud project or click **Create API key in new project**.
  5. Copy your key immediately and store it in `.env`.
* **Billing Requirement:** None for free-tier usage.
* **Free Tier Quotas & Limits (Gemini 2.0 Flash / 1.5 Flash):**
  * Rate Limit: 15 Requests Per Minute (RPM).
  * Daily Cap: 1,500 Requests Per Day (RPD).
  * Context Window: Up to 1,000,000 Tokens Per Minute (TPM).
* **Environment Variable:** `GEMINI_API_KEY`
* **SDK / API Usage:** Use `@google/genai` or `@google/generative-ai` in Node.js, or `google-genai` in Python.

---

### Priority 3: OpenStreetMap & Leaflet (Display & Geocoding)
* **Provider:** OpenStreetMap Foundation
* **Purpose:** Interactive vector/raster map layers and reverse/forward geocoding.
* **API Key Required:** **No key required**. OpenStreetMap and Nominatim are completely open.
* **Official URLs:**
  * Map Tiles: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
  * Geocoding (Nominatim): `https://nominatim.openstreetmap.org/search`
* **Usage Policy & Requirements:**
  * Map Tiles: Must provide an HTTP `User-Agent` identifying your app and adhere to the [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).
  * Nominatim Geocoding: Maximum 1 request per second. You must provide a custom `User-Agent` and contact email header in production.
* **Frontend Implementation:** Leaflet.js (`L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png')`).

---

### Priority 4: Supplemental Free APIs

#### A. Open-Meteo Weather Disruption API
* **Provider:** Open-Meteo
* **Purpose:** Real-time road weather conditions (flooding, rain, storm alerts) to trigger route re-calculations and disruption warnings.
* **Official Documentation:** [Open-Meteo Docs](https://open-meteo.com/en/docs)
* **API Key Required:** **None**.
* **Free Quotas:** Up to 10,000 daily API calls free for non-commercial and educational use.
* **Endpoint:** `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,precipitation,weather_code,wind_speed_10m`

#### B. Supabase (Fleet & Delivery Data Management)
* **Provider:** Supabase
* **Purpose:** PostgreSQL database, Realtime fleet tracking via WebSockets, and secure delivery authentication.
* **Official Dashboard:** [Supabase Dashboard](https://supabase.com/dashboard)
* **API Key Generation Steps:** Create an organization & project -> **Project Settings** -> **API** -> Copy `anon public` key and `Project URL`.
* **Billing Requirement:** Free tier with no credit card required.
* **Environment Variables:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

---

## 3. Environment Configuration (`.env.example`)

```bash
# Server Configuration
PORT=5000
NODE_ENV=development

# Priority 1: OpenRouteService
OPENROUTESERVICE_API_KEY=your_ors_token_here

# Priority 2: Google Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here

# Priority 3: OpenStreetMap / Nominatim Configuration
APP_USER_AGENT=LogiMindAI-Hackathon/1.0 (contact@logimind.local)

# Priority 4: Supabase Database (Optional for Fleet Persistence)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

---

## 4. Backend Implementation Templates

### Node.js / Express Service (`services/logistics.js`)
```javascript
const axios = require('axios');
const { GoogleGenAI } = require('@google/genai');

const ORS_API_KEY = process.env.OPENROUTESERVICE_API_KEY;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1. Calculate Optimized Multi-Stop Route
async function calculateRoute(coordinates) {
  const response = await axios.post(
    'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
    { coordinates },
    {
      headers: {
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json'
      }
    }
  );
  return response.data;
}

// 2. Disruption Recovery & AI Explanation
async function generateDisruptionRecovery(incident, currentRoute) {
  const prompt = `You are the LogiMind AI Logistics Coordinator.
Incident Report: ${incident.type} at coordinates [${incident.location}].
Affected Route: ${JSON.stringify(currentRoute.summary)}.
Provide:
1. Impact assessment on delivery windows.
2. Recommended detour strategy.
3. Plain-language update for the delivery dispatch driver.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: prompt
  });
  return response.text;
}

module.exports = { calculateRoute, generateDisruptionRecovery };
```

---

## 5. CLI Verification Commands

Run these commands in your terminal once you obtain your API keys:

```bash
# Test OpenRouteService Directions API
curl -X POST 'https://api.openrouteservice.org/v2/directions/driving-car/geojson' \
  -H 'Authorization: '$OPENROUTESERVICE_API_KEY \
  -H 'Content-Type: application/json' \
  -d '{"coordinates":[[8.681495,49.41461],[8.687872,49.420318]]}'

# Test Gemini API
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{"contents":[{"parts":[{"text":"Explain route optimization in one sentence."}]}]}'
```
