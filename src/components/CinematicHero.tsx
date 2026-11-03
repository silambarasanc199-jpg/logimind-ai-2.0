import React, {
  Suspense,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import {
  Activity,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Cpu,
  Eye,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  ShieldAlert,
  Sparkles,
  Truck,
} from 'lucide-react';
import type { CameraMode } from './CinematicHeroScene.tsx';

// Lazy-load the Three.js scene module to optimize asset loading
// and prevent Three.js bundle parsing from blocking initial dashboard render times
const LazyCinematicHeroScene = React.lazy(
  () => import('./CinematicHeroScene.tsx')
);

export interface CinematicHeroProps {
  theme?: 'dark' | 'light';
  activeDeliveriesCount?: number;
  availableVehiclesCount?: number;
  totalVehiclesCount?: number;
  isV03Broken?: boolean;
  onExploreOptimization?: () => void;
  onViewDemo?: () => void;
}

export type QualityTier = 'high' | 'balanced' | 'fallback';

export interface HeroPerformanceState {
  isSceneReadyToMount: boolean;
  webglSupported: boolean;
  fps: number;
  frameTimeMs: number;
  dashboardRenderMs: number;
  qualityTier: QualityTier;
  adaptiveDpr: [number, number];
  enableShadows: boolean;
  reportFrameSample: (sampledFps: number, sampledFrameTimeMs: number) => void;
}

/**
 * Custom performance monitoring hook for CinematicHero.
 * - Defers WebGL canvas initialization via requestIdleCallback / requestAnimationFrame
 *   so dashboard render times remain unblocked (<16ms budget).
 * - Monitors rolling WebGL FPS and frame delta times, automatically scaling down DPR/shadows
 *   or switching to the static 2D canvas fallback if frame rates dip.
 */
export function useHeroPerformanceMonitor(
  preferStatic: boolean
): HeroPerformanceState {
  const mountStartRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : 0
  );
  const lowFpsStrikesRef = useRef<number>(0);

  const [isSceneReadyToMount, setIsSceneReadyToMount] =
    useState<boolean>(false);
  const [webglSupported, setWebglSupported] = useState<boolean>(true);
  const [fps, setFps] = useState<number>(60);
  const [frameTimeMs, setFrameTimeMs] = useState<number>(16.6);
  const [dashboardRenderMs, setDashboardRenderMs] = useState<number>(0);
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');

  useEffect(() => {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const commitDuration = Math.max(1, Math.round(now - mountStartRef.current));
    setDashboardRenderMs(commitDuration);

    try {
      const testCanvas = document.createElement('canvas');
      const gl =
        testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
      if (!gl) {
        setWebglSupported(false);
        setQualityTier('fallback');
        return;
      }
    } catch {
      setWebglSupported(false);
      setQualityTier('fallback');
      return;
    }

    let rafId: number | null = null;
    let idleId: number | null = null;
    const win = window as Window & {
      requestIdleCallback?: (
        cb: () => void,
        opts?: { timeout: number }
      ) => number;
      cancelIdleCallback?: (id: number) => void;
    };

    if (typeof win.requestIdleCallback === 'function') {
      idleId = win.requestIdleCallback(
        () => {
          setIsSceneReadyToMount(true);
        },
        { timeout: 180 }
      );
    } else {
      rafId = window.requestAnimationFrame(() => {
        setIsSceneReadyToMount(true);
      });
    }

    return () => {
      if (idleId !== null && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleId);
      }
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const reportFrameSample = useCallback(
    (sampledFps: number, sampledFrameTimeMs: number) => {
      if (preferStatic) return;
      setFps(sampledFps);
      setFrameTimeMs(sampledFrameTimeMs);

      if (sampledFps < 24 || sampledFrameTimeMs > 42) {
        lowFpsStrikesRef.current += 1;
        if (lowFpsStrikesRef.current >= 3) {
          setQualityTier('fallback');
        } else {
          setQualityTier('balanced');
        }
      } else if (sampledFps < 44 || sampledFrameTimeMs > 24) {
        setQualityTier((prev) => (prev === 'high' ? 'balanced' : prev));
      } else {
        lowFpsStrikesRef.current = Math.max(0, lowFpsStrikesRef.current - 1);
      }
    },
    [preferStatic]
  );

  const adaptiveDpr: [number, number] =
    qualityTier === 'high' ? [1, 1.75] : [1, 1];
  const enableShadows = qualityTier === 'high';

  return {
    isSceneReadyToMount,
    webglSupported,
    fps,
    frameTimeMs,
    dashboardRenderMs,
    qualityTier: preferStatic ? 'fallback' : qualityTier,
    adaptiveDpr,
    enableShadows,
    reportFrameSample,
  };
}

interface SelectedObjectTelemetry {
  id: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  status: string;
}

const TELEMETRY_ITEMS: Record<string, SelectedObjectTelemetry> = {
  'primary-truck': {
    id: 'primary-truck',
    title: 'Unit V-01 · Heavy Autonomous Freight Carrier',
    subtitle: 'Coromandel Coastal Express Corridor · Active Route Telemetry',
    metricLabel: 'Payload & SLA Status',
    metricValue: '660 / 1,200 kg · 99.4% On-Schedule',
    status: 'Optimal Trajectory',
  },
  'route-corridor': {
    id: 'route-corridor',
    title: 'Smart Corridor · Dynamic Multi-Objective Route',
    subtitle: 'Constraint-Verified Trajectory (Capacity, SLA, Cost)',
    metricLabel: 'Calculated Corridor Efficiency',
    metricValue: '1.28x Road Factor · -21.4% Cost Delta',
    status: 'AI Route Locked',
  },
  'driver-station': {
    id: 'driver-station',
    title: 'Waypoint WP-04 · Roadside Dispatch Coordinator',
    subtitle: 'Field Operations & Handover Relay Terminal',
    metricLabel: 'Transfer Handover Window',
    metricValue: '8.0 mins Verified · Zero Package Loss',
    status: 'Field Sync Active',
  },
};

export const CinematicHero: React.FC<CinematicHeroProps> = ({
  theme = 'dark',
  activeDeliveriesCount = 8,
  availableVehiclesCount = 4,
  totalVehiclesCount = 5,
  isV03Broken = false,
  onExploreOptimization,
  onViewDemo,
}) => {
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>('coastal');
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [isFullViewport, setIsFullViewport] = useState<boolean>(false);
  const [useStaticFallback, setUseStaticFallback] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  const [selectedTelemetry, setSelectedTelemetry] =
    useState<SelectedObjectTelemetry>(TELEMETRY_ITEMS['primary-truck']);
  const [routePulseBoost, setRoutePulseBoost] = useState<number>(0);

  const perf = useHeroPerformanceMonitor(useStaticFallback);

  const shouldRenderWebGL =
    !useStaticFallback &&
    perf.webglSupported &&
    perf.qualityTier !== 'fallback' &&
    perf.isSceneReadyToMount;

  // Keyboard shortcut 'H' to toggle collapsible bottom control dock (Three.js skill Zen mode)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape' && isFullViewport) {
        setIsFullViewport(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullViewport]);

  useEffect(() => {
    if (routePulseBoost <= 0) return;
    const timer = window.setTimeout(() => setRoutePulseBoost(0), 1200);
    return () => window.clearTimeout(timer);
  }, [routePulseBoost]);

  const renderStaticFallbackCanvas = useCallback(() => {
    const canvas = fallbackCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = (canvas.width = 1280);
    const h = (canvas.height = 720);

    const skyGrad = ctx.createLinearGradient(0, 0, 0, h * 0.62);
    if (theme === 'light') {
      skyGrad.addColorStop(0, '#0284C7');
      skyGrad.addColorStop(0.45, '#38BDF8');
      skyGrad.addColorStop(0.8, '#BAE6FD');
      skyGrad.addColorStop(1, '#FDE68A');
    } else {
      skyGrad.addColorStop(0, '#030914');
      skyGrad.addColorStop(0.38, '#071A2E');
      skyGrad.addColorStop(0.72, '#0C3B5E');
      skyGrad.addColorStop(0.92, '#155E75');
      skyGrad.addColorStop(1, '#F59E0B');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h * 0.62);

    const seaGrad = ctx.createLinearGradient(0, h * 0.56, 0, h);
    seaGrad.addColorStop(0, '#0891B2');
    seaGrad.addColorStop(0.5, '#0E7490');
    seaGrad.addColorStop(1, '#04101E');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, h * 0.56, w, h * 0.44);

    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 64;
    ctx.beginPath();
    ctx.moveTo(w * 0.08, h * 0.96);
    ctx.quadraticCurveTo(w * 0.46, h * 0.62, w * 0.94, h * 0.64);
    ctx.stroke();

    ctx.strokeStyle = '#4CC9FF';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, h * 0.96);
    ctx.quadraticCurveTo(w * 0.46, h * 0.62, w * 0.94, h * 0.64);
    ctx.stroke();
  }, [theme]);

  useEffect(() => {
    if (!shouldRenderWebGL) {
      renderStaticFallbackCanvas();
    }
  }, [shouldRenderWebGL, renderStaticFallbackCanvas]);

  const handleSelectTelemetry = useCallback((key: string) => {
    if (TELEMETRY_ITEMS[key]) {
      setSelectedTelemetry(TELEMETRY_ITEMS[key]);
      setRoutePulseBoost(1.0);
    }
  }, []);

  return (
    <section
      aria-label="Cinematic 3D Logistics Corridor Hero"
      className={
        isFullViewport
          ? 'fixed inset-0 z-50 w-screen h-screen bg-[#040B14] overflow-hidden'
          : 'relative w-full rounded-xl overflow-hidden border border-[var(--border-color)] bg-[#040B14] shadow-xl'
      }
    >
      <div
        className={
          isFullViewport
            ? 'relative w-full h-full flex flex-col justify-between'
            : 'relative w-full min-h-[480px] lg:min-h-[540px] flex flex-col justify-between'
        }
      >
        {/* Lazy-Loaded Three.js 3D Corridor Scene with One Moving Truck or Static Fallback */}
        {shouldRenderWebGL ? (
          <div
            className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
            title="Drag to orbit 3D camera · Click moving 3D truck, glowing route, or roadside coordinator to inspect live telemetry"
          >
            <Suspense fallback={<div className="w-full h-full bg-[#050B14]" />}>
              <LazyCinematicHeroScene
                theme={theme}
                cameraMode={cameraMode}
                isPaused={isPaused}
                pulseBoost={routePulseBoost}
                dpr={perf.adaptiveDpr}
                enableShadows={perf.enableShadows}
                onSelect={handleSelectTelemetry}
                onFrameSample={perf.reportFrameSample}
              />
            </Suspense>
          </div>
        ) : (
          <canvas
            ref={fallbackCanvasRef}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Subtle Dark-Gradient Overlay for High-Contrast Text Readability (Hidden in Zen/Collapsed mode so 3D viewport is 100% unobstructed) */}
        {!dockCollapsed && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                theme === 'light'
                  ? 'linear-gradient(95deg, rgba(6, 18, 34, 0.88) 0%, rgba(7, 22, 42, 0.62) 44%, rgba(7, 22, 42, 0.12) 100%)'
                  : 'linear-gradient(95deg, rgba(5, 11, 20, 0.90) 0%, rgba(7, 19, 33, 0.64) 45%, rgba(5, 11, 20, 0.14) 100%)',
            }}
          />
        )}

        {/* Top Minimal Spec Badge (Solid rgba surface, zero backdrop-filter over WebGL) */}
        <div className="relative z-10 px-6 pt-5 flex flex-wrap items-center justify-between gap-4 pointer-events-none">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-md bg-[#050B14] border border-slate-700 text-xs text-[#F8FAFC] pointer-events-auto">
            <Sparkles className="w-3.5 h-3.5 text-[#4CC9FF]" />
            <span className="font-mono text-[#4CC9FF] font-semibold">
              3D CORRIDOR SIMULATION
            </span>
            <span className="text-slate-500">·</span>
            <span className="text-[#94A3B8] hidden sm:inline">
              Composite PBR Three.js · Instanced Coastal Flora
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums pointer-events-auto">
            <span
              className="px-2.5 py-1 rounded bg-[#050B14] border border-slate-700 text-[#94A3B8] flex items-center gap-1.5"
              title={`Initial Dashboard Commit: ${perf.dashboardRenderMs}ms | Frame Time: ${perf.frameTimeMs}ms`}
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {shouldRenderWebGL ? `${perf.fps} FPS` : 'Static 2D'} ·{' '}
                {perf.qualityTier.toUpperCase()}
              </span>
            </span>
            <span className="px-2.5 py-1 rounded bg-[#050B14] border border-slate-700 text-[#F8FAFC]">
              Active Orders:{' '}
              <strong className="text-[#4CC9FF]">{activeDeliveriesCount}</strong>
            </span>
            <span className="px-2.5 py-1 rounded bg-[#050B14] border border-slate-700 text-[#F8FAFC]">
              Available Fleet:{' '}
              <strong className="text-emerald-400">
                {availableVehiclesCount}/{totalVehiclesCount}
              </strong>
            </span>
            {isV03Broken && (
              <span className="px-2.5 py-1 rounded bg-amber-950 border border-amber-500/50 text-amber-300 font-semibold">
                V-03 Breakdown Active
              </span>
            )}
            <button
              type="button"
              onClick={() => setIsFullViewport((v) => !v)}
              className="px-2.5 py-1 rounded bg-[#050B14] hover:bg-slate-800 border border-slate-700 text-[#4CC9FF] flex items-center gap-1 cursor-pointer"
              title={
                isFullViewport
                  ? 'Exit Full-Bleed 3D Viewport (Esc)'
                  : 'Expand to Full-Bleed 100vw x 100vh 3D Viewport'
              }
            >
              {isFullViewport ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>Exit Fullscreen</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>Full 3D View</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Center-Left Hero Copy & Primary CTA Group (Hidden when Zen Mode is collapsed so 3D center is 100% unobstructed) */}
        {!dockCollapsed ? (
          <div className="relative z-10 px-6 py-6 lg:py-8 max-w-xl space-y-4 pointer-events-none">
            <h1 className="text-2xl sm:text-4xl lg:text-[38px] font-bold tracking-tight text-[#F8FAFC] leading-[1.12]">
              Intelligent Logistics. Optimized Deliveries.
            </h1>

            <p className="text-sm sm:text-base text-[#CBD5E1] leading-relaxed max-w-lg">
              Transform delivery disruptions into intelligent recovery decisions
              with LogiMind AI.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-1 pointer-events-auto">
              <button
                type="button"
                onClick={onExploreOptimization}
                className="px-5 py-2.5 bg-[#4CC9FF] hover:bg-[#00BFFF] text-[#050B14] font-semibold text-xs sm:text-sm rounded-md transition-colors flex items-center gap-2 cursor-pointer shadow-lg"
              >
                <Cpu className="w-4 h-4" />
                <span>Explore Optimization</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onViewDemo}
                className="px-5 py-2.5 bg-[#071321] hover:bg-slate-800 text-[#F8FAFC] border border-[#4CC9FF]/50 font-semibold text-xs sm:text-sm rounded-md transition-colors flex items-center gap-2 cursor-pointer"
              >
                <ShieldAlert className="w-4 h-4 text-[#4CC9FF]" />
                <span>View Demo</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1" />
        )}

        {/* Unified Collapsible Bottom Control Dock (<= 15% viewport footprint, solid rgba surface, no backdrop-filter) */}
        <div className="relative z-10 flex flex-col items-center px-4 pb-3 pointer-events-none">
          <button
            type="button"
            onClick={() => setDockCollapsed((c) => !c)}
            className="pointer-events-auto mb-1.5 px-3 py-1 rounded-full bg-[#050B14] border border-slate-700 text-[11px] font-mono text-[#94A3B8] hover:text-[#F8FAFC] flex items-center gap-1.5 cursor-pointer shadow-md"
            title="Toggle 3D Cinema / Zen Mode (Shortcut: H)"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-[#4CC9FF]" />
                <span>Show Controls (H)</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-[#4CC9FF]" />
                <span>Hide Controls · Zen 3D Mode (H)</span>
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="pointer-events-auto w-full max-w-[960px] rounded-lg bg-[#050B14] border border-slate-800 px-4 py-2.5 shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectTelemetry('primary-truck')}
                    className={`px-2.5 py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer ${
                      selectedTelemetry.id === 'primary-truck'
                        ? 'bg-[#4CC9FF]/20 border-[#4CC9FF] text-[#4CC9FF] font-semibold'
                        : 'bg-[#071321] border-slate-800 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    <Truck className="w-3 h-3 inline mr-1" />
                    Moving Truck V-01
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTelemetry('route-corridor')}
                    className={`px-2.5 py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer ${
                      selectedTelemetry.id === 'route-corridor'
                        ? 'bg-[#4CC9FF]/20 border-[#4CC9FF] text-[#4CC9FF] font-semibold'
                        : 'bg-[#071321] border-slate-800 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Glowing Route
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSelectTelemetry('driver-station')}
                    className={`px-2.5 py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer ${
                      selectedTelemetry.id === 'driver-station'
                        ? 'bg-[#4CC9FF]/20 border-[#4CC9FF] text-[#4CC9FF] font-semibold'
                        : 'bg-[#071321] border-slate-800 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Waypoint Relay
                  </button>
                </div>

                <div className="sm:pl-3 sm:border-l border-slate-800 text-xs">
                  <div className="font-semibold text-[#F8FAFC] flex items-center gap-2">
                    <span>{selectedTelemetry.title}</span>
                    <span className="font-mono text-[11px] text-emerald-400">
                      · {selectedTelemetry.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#94A3B8] font-mono tabular-nums">
                    {selectedTelemetry.metricLabel}:{' '}
                    <strong className="text-[#4CC9FF]">
                      {selectedTelemetry.metricValue}
                    </strong>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs shrink-0">
                <div className="flex items-center gap-1 p-1 rounded bg-[#071321] border border-slate-800">
                  <Compass className="w-3.5 h-3.5 text-[#4CC9FF] ml-1.5 mr-1" />
                  {(
                    [
                      { id: 'coastal', label: 'Coastal Wide' },
                      { id: 'chase', label: 'Truck Chase' },
                      { id: 'overview', label: 'Aerial Route' },
                    ] as const
                  ).map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() => setCameraMode(cam.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        cameraMode === cam.id
                          ? 'bg-[#4CC9FF] text-[#050B14] font-semibold'
                          : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>

                {shouldRenderWebGL && (
                  <button
                    type="button"
                    onClick={() => setIsPaused((p) => !p)}
                    className="px-2.5 py-1.5 rounded bg-[#071321] hover:bg-slate-800 border border-slate-800 text-[#F8FAFC] text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
                    title={isPaused ? 'Resume 3D Motion' : 'Pause 3D Motion'}
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5 text-[#4CC9FF]" />
                        <span>Resume 3D</span>
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5 text-[#4CC9FF]" />
                        <span>Pause 3D</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setUseStaticFallback((s) => !s)}
                  className="px-2.5 py-1.5 rounded bg-[#071321] hover:bg-slate-800 border border-slate-800 text-[#94A3B8] hover:text-[#F8FAFC] text-[11px] font-medium flex items-center gap-1.5 cursor-pointer"
                  title="Toggle between interactive 3D WebGL and static canvas view"
                >
                  <Eye className="w-3.5 h-3.5 text-[#4CC9FF]" />
                  <span>
                    {useStaticFallback ? 'Enable 3D Scene' : 'Static View'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CinematicHero;
