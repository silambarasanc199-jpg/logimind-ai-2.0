import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  Truck,
  Clock,
  Info,
  Compass,
  ExternalLink,
  Loader2,
  Globe,
  CloudRain,
  Wind,
  Thermometer,
  Route,
  Search,
  Sparkles,
  Layers,
} from 'lucide-react';
import {
  Delivery,
  Vehicle,
  AppSettings,
} from '../types/logistics.ts';

interface RoutePlanningViewProps {
  theme?: 'dark' | 'light';
  deliveries: Delivery[];
  vehicles: Vehicle[];
  settings: AppSettings;
}

interface GroundedPlace {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

interface OrsStep {
  instruction: string;
  name: string;
  distance_m: number;
  duration_s: number;
}

interface OrsRouteResult {
  provider: string;
  geojson: any;
  summary: {
    distance_km: number;
    duration_mins: number;
    waypoints_count: number;
  };
  steps: OrsStep[];
}

interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: number;
  lon: number;
  type: string;
}

interface WeatherDisruptionData {
  latitude: number;
  longitude: number;
  temperature_c: number;
  precipitation_mm: number;
  weather_code: number;
  weather_condition: string;
  wind_speed_kmh: number;
  risk_level: 'Normal' | 'Caution' | 'Severe Weather Alert';
  recommended_speed_factor: number;
  operational_advisory: string;
  fetched_at: string;
}

export const RoutePlanningView: React.FC<RoutePlanningViewProps> = ({
  theme = 'dark',
  deliveries,
  vehicles,
  settings,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const orsLayerGroupRef = useRef<L.LayerGroup | null>(null);

  const [selectedVehicleFilter, setSelectedVehicleFilter] = useState<string>('ALL');
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [useStandardOsmTiles, setUseStandardOsmTiles] = useState<boolean>(true);

  // Priority 1: OpenRouteService Multi-Stop Directions State
  const [orsRoute, setOrsRoute] = useState<OrsRouteResult | null>(null);
  const [isOrsLoading, setIsOrsLoading] = useState<boolean>(false);
  const [orsError, setOrsError] = useState<string | null>(null);

  // Priority 2: Gemini Disruption Recovery Incident Report State
  const [incidentReport, setIncidentReport] = useState<{
    report: string;
    model: string;
    timestamp: string;
  } | null>(null);
  const [isIncidentLoading, setIsIncidentLoading] = useState<boolean>(false);

  // Priority 3: OpenStreetMap Nominatim Geocoding State
  const [nominatimQuery, setNominatimQuery] = useState<string>('');
  const [nominatimResults, setNominatimResults] = useState<NominatimPlace[]>([]);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  // Priority 4A: Open-Meteo Weather Disruption State
  const [weatherData, setWeatherData] = useState<WeatherDisruptionData | null>(null);
  const [isWeatherLoading, setIsWeatherLoading] = useState<boolean>(false);

  // Google Maps + Search Grounding State for Corridor Intelligence
  const [mapsQuery, setMapsQuery] = useState(
    'Freight logistics hubs, truck service centers, and commercial staging depots along I-290 Westbound Corridor Oak Park to Naperville'
  );
  const [mapsLat, setMapsLat] = useState<number>(41.8736);
  const [mapsLng, setMapsLng] = useState<number>(-87.7915);
  const [isGroundingLoading, setIsGroundingLoading] = useState(false);
  const [groundingError, setGroundingError] = useState<string | null>(null);
  const [groundingResult, setGroundingResult] = useState<{
    text: string;
    sources: GroundedPlace[];
    mode: 'maps' | 'search';
  } | null>(null);

  const filteredDeliveries = deliveries.filter((d) => {
    if (selectedVehicleFilter === 'ALL') return true;
    if (selectedVehicleFilter === 'UNASSIGNED') return !d.assigned_vehicle_id;
    return d.assigned_vehicle_id === selectedVehicleFilter;
  });

  // Fetch Open-Meteo Weather Disruption for active corridor coordinates
  const fetchWeatherForCoords = useCallback(async (lat: number, lng: number) => {
    setIsWeatherLoading(true);
    try {
      const res = await fetch(
        `/api/weather/disruption?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`
      );
      if (res.ok) {
        const data: WeatherDisruptionData = await res.json();
        setWeatherData(data);
      }
    } catch {
      // Non-fatal weather fetch
    } finally {
      setIsWeatherLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeatherForCoords(41.8736, -87.7915);
  }, [fetchWeatherForCoords]);

  // Priority 1: Calculate OpenRouteService Multi-Stop Directions
  const handleCalculateOrsRoute = async (targetDelivery?: Delivery) => {
    setIsOrsLoading(true);
    setOrsError(null);
    try {
      const coordinates: [number, number][] = [];

      if (targetDelivery) {
        const assignedVeh = vehicles.find(
          (v) => v.id === targetDelivery.assigned_vehicle_id
        );
        if (assignedVeh) {
          coordinates.push([assignedVeh.lng, assignedVeh.lat]);
        }
        coordinates.push([targetDelivery.pickup_lng, targetDelivery.pickup_lat]);
        coordinates.push([targetDelivery.dest_lng, targetDelivery.dest_lat]);
      } else {
        const activeLegs = filteredDeliveries.slice(0, 4);
        for (const d of activeLegs) {
          coordinates.push([d.pickup_lng, d.pickup_lat]);
          coordinates.push([d.dest_lng, d.dest_lat]);
        }
      }

      if (coordinates.length < 2) {
        throw new Error('Select at least one active delivery leg to calculate a route.');
      }

      const res = await fetch('/api/ors/directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to compute OpenRouteService directions.');
      }
      setOrsRoute(data);

      // Render GeoJSON LineString onto the Leaflet map
      if (orsLayerGroupRef.current && mapInstanceRef.current) {
        orsLayerGroupRef.current.clearLayers();
        const geoLayer = L.geoJSON(data.geojson, {
          style: {
            color: '#10B981',
            weight: 5,
            opacity: 0.95,
          },
        });
        geoLayer.addTo(orsLayerGroupRef.current);
        const bounds = geoLayer.getBounds();
        if (bounds.isValid()) {
          mapInstanceRef.current.fitBounds(bounds, {
            padding: [40, 40],
            maxZoom: 13,
          });
        }
      }
    } catch (err: any) {
      setOrsError(err.message || 'OpenRouteService request failed.');
    } finally {
      setIsOrsLoading(false);
    }
  };

  // Priority 2: Generate Gemini Disruption Recovery Report
  const handleGenerateDisruptionReport = async (targetDelivery?: Delivery) => {
    setIsIncidentLoading(true);
    try {
      const focusDelivery =
        targetDelivery ||
        filteredDeliveries.find((d) => d.id === selectedDeliveryId) ||
        filteredDeliveries[0];

      const incidentPayload = {
        type:
          weatherData?.risk_level && weatherData.risk_level !== 'Normal'
            ? `${weatherData.risk_level} (${weatherData.weather_condition})`
            : focusDelivery?.status === 'At Risk'
            ? 'Vehicle Breakdown / Corridor Disruption'
            : 'Corridor Congestion & SLA Verification',
        location: focusDelivery
          ? [focusDelivery.dest_lat, focusDelivery.dest_lng]
          : [41.8736, -87.7915],
        target_id: focusDelivery?.id || 'I-290 Corridor',
      };

      const currentRoutePayload = {
        summary: orsRoute?.summary || {
          delivery_id: focusDelivery?.id,
          corridor: focusDelivery?.route_corridor,
          distance_km: focusDelivery?.estimated_distance_km || Number(totalDistanceKm),
          duration_mins: focusDelivery?.estimated_time_mins || totalTimeMins,
          deadline_label: focusDelivery?.deadline_label,
          weather: weatherData?.weather_condition || 'Clear',
        },
      };

      const res = await fetch('/api/ai/disruption-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incident: incidentPayload,
          currentRoute: currentRoutePayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate report');
      setIncidentReport(data);
    } catch (err: any) {
      setOrsError(err.message || 'Disruption recovery report failed');
    } finally {
      setIsIncidentLoading(false);
    }
  };

  // Priority 3: Nominatim Geocoding Search
  const handleNominatimSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nominatimQuery.trim() || isGeocoding) return;
    setIsGeocoding(true);
    try {
      const res = await fetch(
        `/api/osm/geocode?q=${encodeURIComponent(nominatimQuery.trim())}`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.places)) {
        setNominatimResults(data.places);
        if (data.places[0] && mapInstanceRef.current && orsLayerGroupRef.current) {
          const first = data.places[0];
          mapInstanceRef.current.setView([first.lat, first.lon], 13);
          const marker = L.circleMarker([first.lat, first.lon], {
            radius: 9,
            fillColor: '#10B981',
            color: '#050B14',
            weight: 2,
            fillOpacity: 0.95,
          }).bindPopup(
            `<div style="font-size:12px;"><strong>Nominatim Geocoded Hub</strong><br/>${first.display_name}</div>`
          );
          marker.addTo(orsLayerGroupRef.current);
          marker.openPopup();
          fetchWeatherForCoords(first.lat, first.lon);
        }
      }
    } catch {
      // Ignore geocoding error
    } finally {
      setIsGeocoding(false);
    }
  };

  const handleQueryMapsGrounding = async (
    customQuery?: string,
    lat?: number,
    lng?: number
  ) => {
    const q = (customQuery ?? mapsQuery).trim();
    if (!q || isGroundingLoading) return;
    if (customQuery) setMapsQuery(customQuery);
    const targetLat = lat ?? mapsLat;
    const targetLng = lng ?? mapsLng;
    if (lat !== undefined) setMapsLat(lat);
    if (lng !== undefined) setMapsLng(lng);

    setIsGroundingLoading(true);
    setGroundingError(null);
    try {
      const res = await fetch('/api/ai/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          latitude: targetLat,
          longitude: targetLng,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Maps grounding failed');
      setGroundingResult({
        text: data.text,
        sources: data.sources || [],
        mode: 'maps',
      });
    } catch (err: any) {
      setGroundingError(err.message || 'Maps grounding request failed');
    } finally {
      setIsGroundingLoading(false);
    }
  };

  const handleQuerySearchGrounding = async (customQuery?: string) => {
    const q = (customQuery ?? mapsQuery).trim();
    if (!q || isGroundingLoading) return;
    if (customQuery) setMapsQuery(customQuery);

    setIsGroundingLoading(true);
    setGroundingError(null);
    try {
      const res = await fetch('/api/ai/search-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search grounding failed');
      setGroundingResult({
        text: data.text,
        sources: data.sources || [],
        mode: 'search',
      });
    } catch (err: any) {
      setGroundingError(err.message || 'Search grounding request failed');
    } finally {
      setIsGroundingLoading(false);
    }
  };

  const getTileUrl = useCallback(
    (standardOsm: boolean, currentTheme: 'dark' | 'light') => {
      if (standardOsm) {
        return 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
      }
      return currentTheme === 'light'
        ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
        : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    },
    []
  );

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [41.885, -87.82],
      zoom: 10,
      zoomControl: true,
    });

    const tileLayer = L.tileLayer(getTileUrl(useStandardOsmTiles, theme), {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    const orsGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    tileLayerRef.current = tileLayer;
    layerGroupRef.current = group;
    orsLayerGroupRef.current = orsGroup;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      layerGroupRef.current = null;
      orsLayerGroupRef.current = null;
    };
  }, []);

  // Update map tiles when theme or OSM tile mode changes
  useEffect(() => {
    if (!tileLayerRef.current) return;
    tileLayerRef.current.setUrl(getTileUrl(useStandardOsmTiles, theme));
  }, [theme, useStandardOsmTiles, getTileUrl]);

  // Render markers and route polylines whenever deliveries, vehicles, or filter changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const boundsPoints: [number, number][] = [];
    const primaryAccent = theme === 'light' ? '#0284C7' : '#4CC9FF';

    // 1. Render Fleet Vehicles
    for (const v of vehicles) {
      if (
        selectedVehicleFilter !== 'ALL' &&
        selectedVehicleFilter !== 'UNASSIGNED' &&
        v.id !== selectedVehicleFilter
      ) {
        continue;
      }

      const isBreakdown = v.status === 'Breakdown';
      const color = isBreakdown ? '#EF4444' : primaryAccent;

      const vehicleMarker = L.circleMarker([v.lat, v.lng], {
        radius: 8,
        fillColor: color,
        color: theme === 'light' ? '#0F172A' : '#050B14',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95,
      });

      vehicleMarker.bindPopup(`
        <div style="font-size:12px; line-height:1.4;">
          <div style="font-weight:700; color:${primaryAccent};">${v.id} · ${v.type}</div>
          <div>Status: <strong>${v.status}</strong> (${v.availability})</div>
          <div>Location: ${v.location_name}</div>
          <div>Load: ${v.current_load_kg} / ${v.max_capacity_kg} kg</div>
          <div>Rate: $${v.cost_per_km.toFixed(2)}/km · ${v.speed_kmh} km/h</div>
        </div>
      `);

      vehicleMarker.addTo(group);
      boundsPoints.push([v.lat, v.lng]);
    }

    // 2. Render Delivery Pickup -> Destination Polylines and Destination Markers
    for (const d of filteredDeliveries) {
      const isSelected = selectedDeliveryId === d.id;
      const isAtRisk = d.status === 'At Risk' || d.status === 'Delayed';
      const isDelivered = d.status === 'Delivered';

      const lineColor = isSelected
        ? theme === 'light'
          ? '#0F172A'
          : '#FFFFFF'
        : isAtRisk
        ? '#F59E0B'
        : isDelivered
        ? '#10B981'
        : primaryAccent;

      if (d.assigned_vehicle_id) {
        const assignedVeh = vehicles.find((v) => v.id === d.assigned_vehicle_id);
        if (assignedVeh) {
          const deadheadLine = L.polyline(
            [
              [assignedVeh.lat, assignedVeh.lng],
              [d.pickup_lat, d.pickup_lng],
            ],
            {
              color: lineColor,
              weight: isSelected ? 3 : 1.5,
              dashArray: '4, 6',
              opacity: 0.65,
            }
          );
          deadheadLine.addTo(group);
        }
      }

      const routeLine = L.polyline(
        [
          [d.pickup_lat, d.pickup_lng],
          [d.dest_lat, d.dest_lng],
        ],
        {
          color: lineColor,
          weight: isSelected ? 4 : 2.5,
          opacity: isSelected ? 1 : 0.85,
        }
      );

      routeLine.bindPopup(`
        <div style="font-size:12px; line-height:1.4;">
          <div style="font-weight:700; color:${primaryAccent};">${d.id} (${d.status})</div>
          <div>From: ${d.pickup_location}</div>
          <div>To: <strong>${d.destination}</strong></div>
          <div>Vehicle: ${d.assigned_vehicle_id || 'Unassigned'}</div>
          <div>Calculated Distance: ${d.estimated_distance_km} km</div>
          <div>Calculated Travel Time: ${d.estimated_time_mins} mins (SLA: ${d.deadline_label})</div>
        </div>
      `);
      routeLine.addTo(group);

      const destMarker = L.circleMarker([d.dest_lat, d.dest_lng], {
        radius: isSelected ? 7 : 5,
        fillColor: lineColor,
        color: theme === 'light' ? '#0F172A' : '#050B14',
        weight: 1.5,
        opacity: 1,
        fillOpacity: 0.9,
      });

      destMarker.bindPopup(`
        <div style="font-size:12px; line-height:1.4;">
          <div style="font-weight:700;">Destination: ${d.destination}</div>
          <div>Delivery ID: <strong>${d.id}</strong> · Priority: ${d.priority}</div>
          <div>Weight: ${d.package_weight_kg} kg · Deadline: ${d.deadline_label}</div>
          <div>Calculated Estimate: ${d.estimated_distance_km} km (${d.estimated_time_mins} mins)</div>
        </div>
      `);
      destMarker.addTo(group);

      boundsPoints.push([d.pickup_lat, d.pickup_lng]);
      boundsPoints.push([d.dest_lat, d.dest_lng]);
    }

    if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [35, 35], maxZoom: 12 });
    }
  }, [filteredDeliveries, vehicles, selectedVehicleFilter, selectedDeliveryId, theme]);

  const totalDistanceKm = filteredDeliveries
    .reduce((sum, d) => sum + d.estimated_distance_km, 0)
    .toFixed(1);
  const totalTimeMins = filteredDeliveries.reduce(
    (sum, d) => sum + d.estimated_time_mins,
    0
  );

  return (
    <div className="space-y-6">
      {/* Header & Calculated Estimate Notice */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            Route Planning, OpenRouteService VRP & Corridor Weather Telemetry
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            OpenRouteService turn-by-turn routing, OpenStreetMap + Nominatim geocoding, Open-Meteo road weather disruption alerts, and Gemini recovery advisories.
          </p>
        </div>

        {/* Explicit Calculated Estimate Notice */}
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-md px-3.5 py-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <Info className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
          <span>
            Distance & Travel-Time Values: <strong>Calculated Estimates</strong> (Haversine × {settings.road_tortuosity_factor}x road factor + {settings.transfer_handover_mins}m handover)
          </span>
        </div>
      </div>

      {/* Priority 4A: Open-Meteo Live Corridor Weather Disruption Strip */}
      {weatherData && (
        <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/40 flex items-center justify-center text-[var(--accent-primary)] shrink-0">
              <CloudRain className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-semibold text-[var(--accent-primary)]">
                  OPEN-METEO LIVE ROAD WEATHER
                </span>
                <span aria-hidden="true" className="text-[var(--text-secondary)]">·</span>
                <span className="font-semibold text-[var(--text-main)]">
                  {weatherData.weather_condition}
                </span>
                <span aria-hidden="true" className="text-[var(--text-secondary)]">·</span>
                <span
                  className={`font-mono font-semibold ${
                    weatherData.risk_level === 'Severe Weather Alert'
                      ? 'text-rose-500'
                      : weatherData.risk_level === 'Caution'
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {weatherData.risk_level}
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {weatherData.operational_advisory}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-[var(--text-main)] shrink-0">
            <span className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {weatherData.temperature_c}°C
            </span>
            <span className="flex items-center gap-1.5">
              <CloudRain className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {weatherData.precipitation_mm} mm
            </span>
            <span className="flex items-center gap-1.5">
              <Wind className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              {weatherData.wind_speed_kmh} km/h
            </span>
            <span className="text-[var(--text-secondary)]">
              Speed Factor: {(weatherData.recommended_speed_factor * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      )}

      {/* Vehicle Filter Tabs + ORS & Gemini Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-3.5">
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md overflow-x-auto">
          <button
            onClick={() => setSelectedVehicleFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
              selectedVehicleFilter === 'ALL'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
            }`}
          >
            All Routes ({deliveries.length})
          </button>
          {vehicles.map((v) => (
            <button
              key={v.id}
              onClick={() => setSelectedVehicleFilter(v.id)}
              className={`px-3 py-1.5 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                selectedVehicleFilter === v.id
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
              }`}
            >
              {v.id} ({v.status})
            </button>
          ))}
          <button
            onClick={() => setSelectedVehicleFilter('UNASSIGNED')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
              selectedVehicleFilter === 'UNASSIGNED'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-semibold'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
            }`}
          >
            Unassigned
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleCalculateOrsRoute()}
            disabled={isOrsLoading}
            className="px-3.5 py-1.5 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isOrsLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Route className="w-3.5 h-3.5" />
            )}
            <span>Compute ORS Multi-Stop Directions</span>
          </button>

          <button
            type="button"
            onClick={() => handleGenerateDisruptionReport()}
            disabled={isIncidentLoading}
            className="px-3.5 py-1.5 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-main)] border border-[var(--border-color)] font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {isIncidentLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            )}
            <span>Gemini Disruption Recovery Report</span>
          </button>
        </div>
      </div>

      {/* Main Split: Interactive Map + Sequence Table */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* OpenStreetMap Leaflet Viewport */}
        <div className="lg:col-span-7 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-[var(--border-color)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[var(--text-main)] flex items-center gap-2">
              <Navigation className="w-4 h-4 text-[var(--accent-primary)]" />
              Greater Chicago Logistics Network (OpenStreetMap + Leaflet)
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setUseStandardOsmTiles((prev) => !prev)}
                className="px-2.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[11px] text-[var(--text-main)] hover:border-[var(--accent-primary)] flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3 h-3 text-[var(--accent-primary)]" />
                <span>
                  {useStandardOsmTiles
                    ? 'Tiles: Standard OSM'
                    : 'Tiles: Vector Contrast'}
                </span>
              </button>
            </div>
          </div>

          {/* Priority 3: OpenStreetMap Nominatim Geocoding Search Bar */}
          <form
            onSubmit={handleNominatimSearch}
            className="px-3.5 py-2.5 bg-[var(--bg-primary)] border-b border-[var(--border-color)] flex items-center gap-2"
          >
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
            <input
              type="text"
              value={nominatimQuery}
              onChange={(e) => setNominatimQuery(e.target.value)}
              placeholder="Nominatim Geocode Search (e.g., O'Hare International Airport, Oak Brook IL, Cicero)..."
              className="flex-1 bg-transparent text-xs text-[var(--text-main)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={isGeocoding}
              className="px-2.5 py-1 bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] rounded text-[11px] font-medium text-[var(--text-main)] cursor-pointer disabled:opacity-50"
            >
              {isGeocoding ? 'Geocoding...' : 'Locate Hub'}
            </button>
          </form>

          {nominatimResults.length > 0 && (
            <div className="px-3.5 py-2 bg-[var(--bg-primary)]/80 border-b border-[var(--border-color)] flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-[var(--text-secondary)] font-mono">
                OSM Matches:
              </span>
              {nominatimResults.slice(0, 3).map((pl) => (
                <button
                  key={pl.place_id}
                  type="button"
                  onClick={() => {
                    if (mapInstanceRef.current) {
                      mapInstanceRef.current.setView([pl.lat, pl.lon], 13);
                    }
                    fetchWeatherForCoords(pl.lat, pl.lon);
                  }}
                  className="px-2 py-0.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:border-[var(--accent-primary)] text-[var(--text-main)] truncate max-w-[220px] cursor-pointer"
                >
                  {pl.display_name}
                </button>
              ))}
            </div>
          )}

          <div ref={mapContainerRef} className="w-full h-[460px] z-10" />
        </div>

        {/* Route Sequence & Leg Schedule */}
        <div className="lg:col-span-5 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg overflow-hidden flex flex-col">
          <div className="p-3.5 border-b border-[var(--border-color)] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[var(--text-main)]">
              Delivery Sequence & Calculated Route Estimates
            </h3>
            <span className="text-[11px] font-mono text-[var(--text-secondary)]">
              {filteredDeliveries.length} Legs · {totalDistanceKm} km
            </span>
          </div>

          <div className="divide-y divide-[var(--border-subtle)] overflow-y-auto max-h-[505px]">
            {filteredDeliveries.map((d, index) => {
              const isSelected = selectedDeliveryId === d.id;
              return (
                <div
                  key={d.id}
                  onClick={() => {
                    setSelectedDeliveryId(isSelected ? null : d.id);
                    fetchWeatherForCoords(d.dest_lat, d.dest_lng);
                  }}
                  className={`p-3.5 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent-primary)]/10'
                      : 'hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="text-[var(--text-secondary)]">#{index + 1}</span>
                      <span className="font-bold text-[var(--text-main)]">{d.id}</span>
                      <span aria-hidden="true" className="text-[var(--text-secondary)]">·</span>
                      <span className="text-[var(--accent-primary)]">
                        {d.assigned_vehicle_id || 'Unassigned'}
                      </span>
                    </div>
                    <span
                      className={`font-mono ${
                        d.status === 'At Risk'
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : d.status === 'Delayed'
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : d.status === 'Delivered'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-[var(--accent-primary)]'
                      }`}
                    >
                      {d.status}
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px] text-[var(--text-secondary)] mt-1.5">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                      <span className="truncate">Pickup: {d.pickup_location}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--text-main)] font-medium">
                      <Navigation className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                      <span className="truncate">Destination: {d.destination}</span>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center justify-between gap-2 font-mono tabular-nums text-[11px] text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1">
                      <Truck className="w-3 h-3 text-[var(--accent-primary)]" />
                      {d.package_weight_kg} kg
                    </span>
                    <span>Est. Dist: {d.estimated_distance_km} km</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[var(--accent-primary)]" />
                      {d.estimated_time_mins}m (SLA {d.deadline_mins}m)
                    </span>
                    <div className="flex items-center gap-2 font-sans">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCalculateOrsRoute(d);
                        }}
                        className="text-emerald-500 hover:underline font-semibold cursor-pointer"
                      >
                        ORS Route
                      </button>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQueryMapsGrounding(
                            `Logistics docks, commercial vehicle parking, and nearby service facilities around ${d.destination} (${d.route_corridor})`,
                            d.dest_lat,
                            d.dest_lng
                          );
                        }}
                        className="text-[var(--accent-primary)] hover:underline font-semibold cursor-pointer"
                      >
                        Maps →
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Priority 1 & Priority 2 Results: OpenRouteService Turn-by-Turn & Gemini Disruption Recovery */}
      {(orsRoute || incidentReport || orsError) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {orsError && (
            <div className="lg:col-span-12 p-3.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300">
              {orsError}
            </div>
          )}

          {orsRoute && (
            <div className="lg:col-span-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div>
                  <div className="text-[11px] font-mono text-emerald-400 font-semibold">
                    PRIORITY 1 · {orsRoute.provider.toUpperCase()}
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-main)]">
                    Turn-by-Turn Multi-Stop Directions (driving-car/geojson)
                  </h3>
                </div>
                <div className="text-right font-mono text-xs">
                  <div className="font-bold text-[var(--text-main)]">
                    {orsRoute.summary.distance_km} km
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    {orsRoute.summary.duration_mins} mins ({orsRoute.summary.waypoints_count} pts)
                  </div>
                </div>
              </div>

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {orsRoute.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-mono text-[11px] flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="text-[var(--text-main)] font-medium">
                          {step.instruction}
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          {step.name}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] text-[var(--text-secondary)] shrink-0">
                      {(step.distance_m / 1000).toFixed(1)} km · {Math.max(1, Math.round(step.duration_s / 60))}m
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {incidentReport && (
            <div className="lg:col-span-6 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--border-color)] pb-3">
                <div>
                  <div className="text-[11px] font-mono text-[var(--accent-primary)] font-semibold">
                    PRIORITY 2 · GEMINI DISRUPTION RECOVERY COORDINATOR
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text-main)]">
                    Automated Logistics Incident & Detour Report
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-[var(--text-secondary)]">
                  {incidentReport.model}
                </span>
              </div>
              <div className="p-3.5 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-xs text-[var(--text-main)] whitespace-pre-wrap leading-relaxed max-h-56 overflow-y-auto">
                {incidentReport.report}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Google Maps & Google Search Grounding Panel for Route Corridors */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 font-semibold">
              <MapPin className="w-3.5 h-3.5" />
              <span>
                GOOGLE MAPS & SEARCH GROUNDING (gemini-3.8-flash)
              </span>
            </div>
            <h3 className="text-sm font-semibold text-[var(--text-main)] mt-0.5">
              Live Corridor Place Discovery & Highway Traffic Grounding
            </h3>
          </div>
          <span className="text-[11px] font-mono text-[var(--text-secondary)]">
            Retrieval Coords: {mapsLat.toFixed(4)}, {mapsLng.toFixed(4)}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={mapsQuery}
            onChange={(e) => setMapsQuery(e.target.value)}
            placeholder="Query real-world freight hubs, repair depots, or corridor traffic..."
            className="flex-1 px-3.5 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)]"
          />
          <button
            type="button"
            onClick={() => handleQueryMapsGrounding()}
            disabled={isGroundingLoading}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isGroundingLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Compass className="w-3.5 h-3.5" />
            )}
            <span>Google Maps Grounding</span>
          </button>
          <button
            type="button"
            onClick={() => handleQuerySearchGrounding()}
            disabled={isGroundingLoading}
            className="px-4 py-2 bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-main)] border border-[var(--border-color)] font-semibold text-xs rounded-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Globe className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span>Google Search Grounding</span>
          </button>
        </div>

        {groundingError && (
          <div className="p-3 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
            {groundingError}
          </div>
        )}

        {groundingResult && (
          <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md p-4 space-y-3 text-xs">
            <div className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">
              {groundingResult.text}
            </div>

            {groundingResult.sources.length > 0 && (
              <div className="pt-3 border-t border-[var(--border-color)] space-y-2">
                <div className="text-[11px] font-semibold text-emerald-400">
                  {groundingResult.mode === 'maps'
                    ? `Grounded Google Maps Links (${groundingResult.sources.length}):`
                    : `Grounded Web Search Links (${groundingResult.sources.length}):`}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {groundingResult.sources.map((src, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded bg-[var(--bg-secondary)] border border-[var(--border-color)] space-y-1"
                    >
                      <a
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-primary)] hover:underline font-medium"
                      >
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{src.title}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                      {src.reviewSnippets &&
                        src.reviewSnippets.map((s, si) => (
                          <p
                            key={si}
                            className="text-[11px] text-[var(--text-secondary)] italic"
                          >
                            "{s}"
                          </p>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
