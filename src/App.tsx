/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import {
  LayoutDashboard,
  Package,
  Truck,
  ShieldAlert,
  Cpu,
  Map,
  FlaskConical,
  Settings,
  UserCheck,
  Menu,
  X,
  Sun,
  Moon,
  Bot,
} from 'lucide-react';
import {
  SystemStateResponse,
  Delivery,
  Vehicle,
  DisruptionType,
  AppSettings,
  UserProfile,
} from './types/logistics.ts';
import { DashboardView } from './components/DashboardView.tsx';
import { DeliveryManagementView } from './components/DeliveryManagementView.tsx';
import { FleetManagementView } from './components/FleetManagementView.tsx';
import { DisruptionManagementView } from './components/DisruptionManagementView.tsx';
import { OptimizationCenterView } from './components/OptimizationCenterView.tsx';
import { RoutePlanningView } from './components/RoutePlanningView.tsx';
import { AnalyticsExperimentsView } from './components/AnalyticsExperimentsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { AuthView } from './components/AuthView.tsx';
import { AIIntelligenceHubView } from './components/AIIntelligenceHubView.tsx';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase.ts';

const CinematicHero = React.lazy(
  () => import('./components/CinematicHero.tsx')
);

type PageId =
  | 'dashboard'
  | 'deliveries'
  | 'fleet'
  | 'disruptions'
  | 'optimization'
  | 'routes'
  | 'ai-copilot'
  | 'analytics'
  | 'settings'
  | 'auth';

const NAV_ITEMS: {
  id: PageId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Operations Dashboard', icon: LayoutDashboard },
  { id: 'deliveries', label: 'Delivery Management', icon: Package },
  { id: 'fleet', label: 'Fleet Management', icon: Truck },
  { id: 'disruptions', label: 'Disruption & Replay', icon: ShieldAlert },
  { id: 'optimization', label: 'AI Optimization Center', icon: Cpu },
  { id: 'routes', label: 'Route Planning', icon: Map },
  { id: 'ai-copilot', label: 'AI Copilot & Grounding', icon: Bot },
  { id: 'analytics', label: 'Research & Experiments', icon: FlaskConical },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'auth', label: 'Login / Operator Profile', icon: UserCheck },
];

const THEME_STORAGE_KEY = 'logimind_theme';

export default function App() {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Theme state: persisted in localStorage, defaults to system preference if none saved
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        return saved;
      }
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: light)').matches
      ) {
        return 'light';
      }
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (saved !== 'dark' && saved !== 'light') {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const handleToggleTheme = () => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
      return next;
    });
  };

  const [currentUser, setCurrentUser] = useState<UserProfile>({
    id: 'USR-0101',
    name: 'Elena Rostova',
    email: 'e.rostova@logimind.io',
    role: 'Logistics Dispatcher',
    facility: 'Chicago Central Dispatch Hub',
  });
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          setAuthToken(token);
          setCurrentUser((prev) => ({
            ...prev,
            id: firebaseUser.uid,
            name: firebaseUser.displayName || prev.name,
            email: firebaseUser.email || prev.email,
          }));
          await fetch('/api/users/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              name: firebaseUser.displayName || 'Elena Rostova',
              email: firebaseUser.email,
            }),
          });
        } catch (err) {
          console.error('Error syncing Firebase user session:', err);
        }
      } else {
        setAuthToken(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const [systemState, setSystemState] = useState<SystemStateResponse>({
    deliveries: [],
    vehicles: [],
    disruptions: [],
    plans: [],
    approved_assignments: [],
    experiments: [],
    settings: {
      dataset_label:
        'Demo Dataset — Greater Chicago Metro Logistics Hub (Deterministic)',
      road_tortuosity_factor: 1.28,
      transfer_handover_mins: 8,
      delay_penalty_per_min_usd: 2.5,
      default_priority_weight: 'Critical > High > Standard (EDF)',
      enforce_strict_capacity: true,
      auto_record_experiments: true,
    },
  });

  const fetchSystemState = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
      }
      const res = await fetch('/api/state', { headers });
      if (!res.ok)
        throw new Error('Failed to load operational data from server.');
      const data: SystemStateResponse = await res.json();
      setSystemState(data);
      setApiError(null);
    } catch (err: any) {
      setApiError(err.message || 'Network error while fetching state');
    } finally {
      setIsLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    fetchSystemState();
  }, [fetchSystemState]);

  const handleApiCall = async (url: string, options: RequestInit) => {
    setIsBusy(true);
    setApiError(null);
    try {
      const authHeaders: Record<string, string> = authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {};
      const res = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
          ...((options.headers as Record<string, string>) || {}),
        },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Operation failed');
      }
      if (json.state) {
        setSystemState(json.state);
      } else if (json.deliveries && json.vehicles) {
        setSystemState(json);
      } else {
        await fetchSystemState();
      }
      return json;
    } finally {
      setIsBusy(false);
    }
  };

  // Actions
  const handleTriggerV03Demo = async () => {
    await handleApiCall('/api/disruptions/analyze', {
      method: 'POST',
      body: JSON.stringify({
        type: 'Vehicle Breakdown',
        target_id: 'V-03',
        description:
          'Demo Scenario: Vehicle V-03 experiences a mid-route breakdown on I-290 while carrying three delivery orders (DEL-105, DEL-106, DEL-107).',
      }),
    });
    setActivePage('disruptions');
  };

  const handleResetDemo = async () => {
    await handleApiCall('/api/reset-demo', { method: 'POST' });
  };

  const handleCreateDelivery = async (payload: Partial<Delivery>) => {
    await handleApiCall('/api/deliveries', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const handleUpdateDelivery = async (
    id: string,
    payload: Partial<Delivery>
  ) => {
    await handleApiCall(`/api/deliveries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  };

  const handleDeleteDelivery = async (id: string) => {
    await handleApiCall(`/api/deliveries/${id}`, {
      method: 'DELETE',
    });
  };

  const handleCreateVehicle = async (payload: Partial<Vehicle>) => {
    await handleApiCall('/api/vehicles', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const handleUpdateVehicle = async (id: string, payload: Partial<Vehicle>) => {
    await handleApiCall(`/api/vehicles/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  };

  const handleDeleteVehicle = async (id: string) => {
    await handleApiCall(`/api/vehicles/${id}`, {
      method: 'DELETE',
    });
  };

  const handleSimulateVehicleBreakdown = async (vehicleId: string) => {
    await handleApiCall('/api/disruptions/analyze', {
      method: 'POST',
      body: JSON.stringify({
        type: 'Vehicle Breakdown',
        target_id: vehicleId,
      }),
    });
    setActivePage('disruptions');
  };

  const handleAnalyzeDisruption = async (payload: {
    type: DisruptionType;
    target_id: string;
    description?: string;
  }) => {
    await handleApiCall('/api/disruptions/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  };

  const handleApprovePlan = async (planId: string) => {
    await handleApiCall(`/api/plans/${planId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        approved_by: `${currentUser.name} (${currentUser.role})`,
      }),
    });
  };

  const handleRejectPlan = async (planId: string) => {
    await handleApiCall(`/api/plans/${planId}/reject`, {
      method: 'POST',
    });
  };

  const handleRestoreSnapshot = async (disruptionId: string) => {
    await handleApiCall(`/api/disruptions/${disruptionId}/restore-snapshot`, {
      method: 'POST',
    });
  };

  const handleReplayDisruption = async (disruptionId: string) => {
    return await handleApiCall(`/api/disruptions/${disruptionId}/replay`, {
      method: 'POST',
    });
  };

  const handleRunControlledScenario = async (scenarioCode: string) => {
    await handleApiCall('/api/experiments/run', {
      method: 'POST',
      body: JSON.stringify({ scenario_code: scenarioCode }),
    });
  };

  const handleClearExperiments = async () => {
    await handleApiCall('/api/experiments', {
      method: 'DELETE',
    });
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    await handleApiCall('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(newSettings),
    });
  };

  const activeNavLabel =
    NAV_ITEMS.find((item) => item.id === activePage)?.label ||
    'Operations Dashboard';

  const atRiskCount = systemState.deliveries.filter(
    (d) => d.status === 'At Risk' || d.status === 'Delayed'
  ).length;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-main)] flex flex-col lg:flex-row transition-colors duration-200">
      {/* Persistent Desktop Sidebar Navigation */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 bg-[var(--bg-secondary)] border-r border-[var(--border-color)] justify-between transition-colors duration-200">
        <div>
          {/* Sidebar Brand Header */}
          <div className="h-16 px-5 flex items-center justify-between border-b border-[var(--border-color)]">
            <button
              onClick={() => setActivePage('dashboard')}
              className="text-base font-bold tracking-tight text-[var(--text-main)] flex items-center gap-2.5 whitespace-nowrap cursor-pointer"
            >
              <span className="w-7 h-7 rounded bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/40 flex items-center justify-center text-[var(--accent-primary)] font-mono text-xs font-bold">
                LM
              </span>
              <span>LogiMind AI</span>
            </button>
          </div>

          <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
            <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
              Optimize Every Route. Recover From Every Disruption.
            </p>
          </div>

          {/* Navigation Links */}
          <nav className="p-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'disruptions' && atRiskCount > 0 && (
                    <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
                      {atRiskCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Operator Profile Footer */}
        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-primary)]/50">
          <button
            onClick={() => setActivePage('auth')}
            className="w-full text-left group cursor-pointer"
          >
            <div className="text-xs font-semibold text-[var(--text-main)] group-hover:text-[var(--accent-primary)] transition-colors truncate">
              {currentUser.name}
            </div>
            <div className="text-[11px] text-[var(--text-secondary)] truncate">
              {currentUser.role} · {currentUser.facility}
            </div>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: 3 Zones separated by gap-8 */}
        <header className="h-16 px-4 sm:px-6 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] flex items-center justify-between gap-8 sticky top-0 z-30 transition-colors duration-200">
          {/* Zone 1: Mobile Menu Trigger + Contextual Breadcrumb */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle Navigation Menu"
              className="lg:hidden p-2 text-[var(--text-secondary)] hover:text-[var(--text-main)] rounded-md cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
            <div className="flex items-center gap-2 text-xs sm:text-sm font-medium whitespace-nowrap truncate">
              <span className="text-[var(--text-secondary)] hidden sm:inline">
                LogiMind AI
              </span>
              <span className="text-[var(--text-secondary)]/50 hidden sm:inline">/</span>
              <span className="text-[var(--text-main)] font-semibold truncate">
                {activeNavLabel}
              </span>
            </div>
          </div>

          {/* Zone 2: Quick Top Navigation Links (Desktop) */}
          <nav className="hidden xl:flex items-center gap-6 text-xs font-medium text-[var(--text-secondary)]">
            <button
              onClick={() => setActivePage('dashboard')}
              className={`hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'dashboard'
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : ''
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActivePage('disruptions')}
              className={`hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'disruptions'
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : ''
              }`}
            >
              Disruption & Replay
            </button>
            <button
              onClick={() => setActivePage('optimization')}
              className={`hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'optimization'
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : ''
              }`}
            >
              Optimization Engine
            </button>
            <button
              onClick={() => setActivePage('routes')}
              className={`hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'routes'
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : ''
              }`}
            >
              Route Map
            </button>
            <button
              onClick={() => setActivePage('ai-copilot')}
              className={`hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'ai-copilot'
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : ''
              }`}
            >
              AI Copilot & Grounding
            </button>
            <button
              onClick={() => setActivePage('analytics')}
              className={`hover:text-[var(--text-main)] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activePage === 'analytics'
                  ? 'text-[var(--accent-primary)] font-semibold'
                  : ''
              }`}
            >
              Research & Experiments
            </button>
          </nav>

          {/* Zone 3: Theme Toggle (Sun/Moon) + Primary Action Button */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={
                theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
              }
              title={
                theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'
              }
              className="px-3 py-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] text-[var(--text-main)] text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden sm:inline">Light Mode</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </>
              )}
            </button>

            <button
              onClick={handleTriggerV03Demo}
              disabled={isBusy}
              className="px-3.5 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              Simulate V-03 Breakdown
            </button>
          </div>
        </header>

        {/* Responsive Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[var(--bg-secondary)] border-b border-[var(--border-color)] px-4 py-3 space-y-1 z-20">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActivePage(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-xs font-medium ${
                    isActive
                      ? 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-main)]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {apiError && (
            <div className="mb-6 bg-rose-500/15 border border-rose-500/40 rounded-md p-3.5 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between">
              <span>{apiError}</span>
              <button
                onClick={() => setApiError(null)}
                className="text-rose-700 dark:text-rose-300 hover:underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4 py-12">
              <div className="h-24 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[...Array(6)].map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg animate-pulse"
                  />
                ))}
              </div>
              <div className="h-80 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg animate-pulse" />
            </div>
          ) : (
            <>
              {activePage === 'dashboard' && (
                <div className="space-y-8">
                  <Suspense
                    fallback={
                      <div className="h-[460px] rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-color)] animate-pulse" />
                    }
                  >
                    <CinematicHero
                      theme={theme}
                      activeDeliveriesCount={
                        systemState.deliveries.filter(
                          (d) => d.status !== 'Delivered'
                        ).length
                      }
                      availableVehiclesCount={
                        systemState.vehicles.filter(
                          (v) =>
                            v.availability === 'Available' &&
                            v.status !== 'Breakdown' &&
                            v.status !== 'Maintenance'
                        ).length
                      }
                      totalVehiclesCount={systemState.vehicles.length}
                      isV03Broken={
                        systemState.vehicles.find((v) => v.id === 'V-03')
                          ?.status === 'Breakdown'
                      }
                      onExploreOptimization={() =>
                        setActivePage('optimization')
                      }
                      onViewDemo={handleTriggerV03Demo}
                    />
                  </Suspense>
                  <DashboardView
                    theme={theme}
                    deliveries={systemState.deliveries}
                    vehicles={systemState.vehicles}
                    disruptions={systemState.disruptions}
                    plans={systemState.plans}
                    settings={systemState.settings}
                    onNavigate={(p) => setActivePage(p as PageId)}
                    onTriggerV03Demo={handleTriggerV03Demo}
                    onResetDemo={handleResetDemo}
                    isBusy={isBusy}
                  />
                </div>
              )}

              {activePage === 'deliveries' && (
                <DeliveryManagementView
                  deliveries={systemState.deliveries}
                  vehicles={systemState.vehicles}
                  onCreateDelivery={handleCreateDelivery}
                  onUpdateDelivery={handleUpdateDelivery}
                  onDeleteDelivery={handleDeleteDelivery}
                />
              )}

              {activePage === 'fleet' && (
                <FleetManagementView
                  vehicles={systemState.vehicles}
                  deliveries={systemState.deliveries}
                  onCreateVehicle={handleCreateVehicle}
                  onUpdateVehicle={handleUpdateVehicle}
                  onDeleteVehicle={handleDeleteVehicle}
                  onSimulateVehicleBreakdown={handleSimulateVehicleBreakdown}
                />
              )}

              {activePage === 'disruptions' && (
                <DisruptionManagementView
                  deliveries={systemState.deliveries}
                  vehicles={systemState.vehicles}
                  disruptions={systemState.disruptions}
                  plans={systemState.plans}
                  approvedAssignments={systemState.approved_assignments}
                  onAnalyzeDisruption={handleAnalyzeDisruption}
                  onApprovePlan={handleApprovePlan}
                  onRejectPlan={handleRejectPlan}
                  onRestoreSnapshot={handleRestoreSnapshot}
                  onReplayDisruption={handleReplayDisruption}
                  onResetDemo={handleResetDemo}
                  onNavigate={(p) => setActivePage(p as PageId)}
                  isBusy={isBusy}
                />
              )}

              {activePage === 'optimization' && (
                <OptimizationCenterView
                  deliveries={systemState.deliveries}
                  vehicles={systemState.vehicles}
                  plans={systemState.plans}
                  disruptions={systemState.disruptions}
                  settings={systemState.settings}
                  onApprovePlan={handleApprovePlan}
                  onTriggerV03Demo={handleTriggerV03Demo}
                  isBusy={isBusy}
                />
              )}

              {activePage === 'routes' && (
                <RoutePlanningView
                  theme={theme}
                  deliveries={systemState.deliveries}
                  vehicles={systemState.vehicles}
                  settings={systemState.settings}
                />
              )}

              {activePage === 'ai-copilot' && (
                <AIIntelligenceHubView
                  deliveries={systemState.deliveries}
                  vehicles={systemState.vehicles}
                  disruptions={systemState.disruptions}
                  plans={systemState.plans}
                />
              )}

              {activePage === 'analytics' && (
                <AnalyticsExperimentsView
                  experiments={systemState.experiments}
                  deliveries={systemState.deliveries}
                  vehicles={systemState.vehicles}
                  approvedAssignments={systemState.approved_assignments}
                  onRunControlledScenario={handleRunControlledScenario}
                  onClearExperiments={handleClearExperiments}
                  isBusy={isBusy}
                />
              )}

              {activePage === 'settings' && (
                <SettingsView
                  settings={systemState.settings}
                  onSaveSettings={handleSaveSettings}
                  onResetDemo={handleResetDemo}
                  isBusy={isBusy}
                />
              )}

              {activePage === 'auth' && (
                <AuthView
                  currentUser={currentUser}
                  isFirebaseAuthenticated={Boolean(authToken)}
                  onAuthenticate={async (profile, token) => {
                    setCurrentUser(profile);
                    if (token !== undefined) {
                      setAuthToken(token);
                    }
                    const effectiveToken =
                      token !== undefined ? token : authToken;
                    if (effectiveToken) {
                      await fetch('/api/users/sync', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${effectiveToken}`,
                        },
                        body: JSON.stringify(profile),
                      }).catch(() => {});
                    }
                    setActivePage('dashboard');
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
