import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Compass,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  MessageSquare,
  Music,
  Navigation,
  Send,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react';
import {
  Delivery,
  Vehicle,
  DisruptionEvent,
  OptimizationPlan,
} from '../types/logistics.ts';

interface AIIntelligenceHubViewProps {
  deliveries: Delivery[];
  vehicles: Vehicle[];
  disruptions: DisruptionEvent[];
  plans: OptimizationPlan[];
}

type ModelTier =
  | 'gemini-4-argon'
  | 'gemini-3.8-flash'
  | 'gemini-3.1-flash-lite';

type PersonaId =
  | 'dispatch_commander'
  | 'disruption_strategist'
  | 'route_economist';

interface ChatTurn {
  id: string;
  role: 'user' | 'model';
  text: string;
  modelUsed?: string;
  timestamp: string;
  fallbackNotice?: string;
}

interface GroundingLink {
  title: string;
  uri: string;
  sourceType: 'maps' | 'search';
  reviewSnippets?: string[];
}

export const AIIntelligenceHubView: React.FC<AIIntelligenceHubViewProps> = ({
  deliveries,
  vehicles,
  disruptions,
}) => {
  // 1. Multi-Turn Gemini Chatbot State
  const [selectedModel, setSelectedModel] =
    useState<ModelTier>('gemini-3.8-flash');
  const [selectedPersona, setSelectedPersona] =
    useState<PersonaId>('dispatch_commander');
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([
    {
      id: 'welcome-1',
      role: 'model',
      text: `LogiMind AI Dispatch Copilot online. I have real-time access to your ${deliveries.length} delivery orders, ${vehicles.length} fleet vehicles, and ${disruptions.length} recorded disruption events. Ask me to audit SLA risks, compare Plan A/B/C recovery trade-offs, or optimize vehicle load balancing.`,
      modelUsed: 'gemini-3.8-flash',
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    },
  ]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatTurns, isChatLoading]);

  const handleSendChat = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? chatInput).trim();
    if (!textToSend || isChatLoading) return;

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const historyForApi = chatTurns
      .filter((t) => t.id !== 'welcome-1')
      .map((t) => ({ role: t.role, text: t.text }));

    setChatTurns((prev) => [...prev, userTurn]);
    if (!customPrompt) setChatInput('');
    setIsChatLoading(true);
    setChatError(null);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: historyForApi,
          model: selectedModel,
          persona: selectedPersona,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Chat request failed');
      }
      const modelTurn: ChatTurn = {
        id: `m-${Date.now()}`,
        role: 'model',
        text: data.reply,
        modelUsed: data.modelUsed || selectedModel,
        fallbackNotice: data.fallbackNotice,
        timestamp: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
      setChatTurns((prev) => [...prev, modelTurn]);
    } catch (err: any) {
      setChatError(err.message || 'Failed to communicate with Gemini chat');
    } finally {
      setIsChatLoading(false);
    }
  };

  // 2. Google Maps Grounding State (gemini-3.8-flash + googleMaps)
  const [mapsQuery, setMapsQuery] = useState(
    'Heavy truck service depots, freight distribution centers, and highway rest hubs near I-290 Oak Park and Cicero Chicago'
  );
  const [mapsLat, setMapsLat] = useState<number>(41.8736);
  const [mapsLng, setMapsLng] = useState<number>(-87.7915);
  const [geoStatus, setGeoStatus] = useState<string>('Chicago I-290 Hub Coords');
  const [isMapsLoading, setIsMapsLoading] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsResult, setMapsResult] = useState<{
    text: string;
    sources: GroundingLink[];
  } | null>(null);

  const handleUseBrowserGeolocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Geolocation not supported by browser');
      return;
    }
    setGeoStatus('Locating...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMapsLat(Number(pos.coords.latitude.toFixed(4)));
        setMapsLng(Number(pos.coords.longitude.toFixed(4)));
        setGeoStatus(
          `Live GPS (${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)})`
        );
      },
      () => {
        setGeoStatus('Using Default Hub Coords (41.8736, -87.7915)');
      }
    );
  };

  const handleRunMapsGrounding = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? mapsQuery).trim();
    if (!q || isMapsLoading) return;
    if (overrideQuery) setMapsQuery(overrideQuery);
    setIsMapsLoading(true);
    setMapsError(null);

    try {
      const res = await fetch('/api/ai/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          latitude: mapsLat,
          longitude: mapsLng,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Maps grounding failed');
      }
      setMapsResult({
        text: data.text,
        sources: data.sources || [],
      });
    } catch (err: any) {
      setMapsError(err.message || 'Maps grounding error');
    } finally {
      setIsMapsLoading(false);
    }
  };

  // 3. Google Search Grounding State (gemini-3.8-flash + googleSearch)
  const [searchQuery, setSearchQuery] = useState(
    'Current highway freight traffic conditions, weather advisories, and logistics supply chain updates in Greater Chicago I-290 and I-90 corridors'
  );
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{
    text: string;
    sources: GroundingLink[];
  } | null>(null);

  const handleRunSearchGrounding = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q || isSearchLoading) return;
    if (overrideQuery) setSearchQuery(overrideQuery);
    setIsSearchLoading(true);
    setSearchError(null);

    try {
      const res = await fetch('/api/ai/search-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Search grounding failed');
      }
      setSearchResult({
        text: data.text,
        sources: data.sources || [],
      });
    } catch (err: any) {
      setSearchError(err.message || 'Search grounding error');
    } finally {
      setIsSearchLoading(false);
    }
  };

  // 4. Lyria Music Generation State (lyria-3-clip-preview / lyria-3-pro-preview)
  const [musicPrompt, setMusicPrompt] = useState(
    'Generate a calm, futuristic ambient electronic soundtrack for a high-tech logistics dispatch control center with subtle rhythmic synth pulses and warm atmospheric pads.'
  );
  const [musicModel, setMusicModel] = useState<
    'lyria-3-clip-preview' | 'lyria-3-pro-preview'
  >('lyria-3-clip-preview');
  const [isMusicLoading, setIsMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicResult, setMusicResult] = useState<{
    audioDataUrl: string;
    lyrics: string;
    modelUsed: string;
  } | null>(null);

  const handleGenerateMusic = async (overridePrompt?: string) => {
    const p = (overridePrompt ?? musicPrompt).trim();
    if (!p || isMusicLoading) return;
    if (overridePrompt) setMusicPrompt(overridePrompt);
    setIsMusicLoading(true);
    setMusicError(null);

    try {
      const res = await fetch('/api/ai/music', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: p,
          model: musicModel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Music generation failed');
      }
      setMusicResult({
        audioDataUrl: data.audioDataUrl,
        lyrics: data.lyrics || '',
        modelUsed: data.modelUsed,
      });
    } catch (err: any) {
      setMusicError(err.message || 'Lyria music generation error');
    } finally {
      setIsMusicLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-[var(--accent-primary)] font-mono font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              GEMINI MULTI-MODEL COPILOT · GOOGLE MAPS & SEARCH GROUNDING ·
              LYRIA AUDIO STUDIO
            </span>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-main)]">
            AI Copilot, Live Grounding & Dispatch Audio Studio
          </h2>
          <p className="text-xs text-[var(--text-secondary)] max-w-3xl">
            Multi-turn conversational dispatch assistant powered by{' '}
            <code className="font-mono text-[var(--accent-primary)]">
              gemini-4-argon
            </code>
            ,{' '}
            <code className="font-mono text-[var(--accent-primary)]">
              gemini-3.8-flash
            </code>
            , and{' '}
            <code className="font-mono text-[var(--accent-primary)]">
              gemini-3.1-flash-lite
            </code>
            , integrated with live Google Maps Grounding, Google Search
            Grounding, and Lyria 3 Command Center Audio synthesis.
          </p>
        </div>
      </div>

      {/* Top Grid: Multi-Turn Gemini Chatbot (Left) + Maps & Search Grounding (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Multi-Turn Gemini Chatbot Panel */}
        <div className="xl:col-span-7 bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg flex flex-col h-[640px]">
          {/* Chatbot Header & Role/Model Controls */}
          <div className="p-4 border-b border-[var(--border-color)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  Multi-Turn Gemini Logistics Copilot
                </h3>
              </div>
              <button
                type="button"
                onClick={() =>
                  setChatTurns((prev) => prev.slice(0, 1))
                }
                className="px-2.5 py-1 rounded bg-[var(--bg-primary)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-main)] flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Reset Thread</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  Gemini Model Tier
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) =>
                    setSelectedModel(e.target.value as ModelTier)
                  }
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-main)] font-mono"
                >
                  <option value="gemini-4-argon">
                    gemini-4-argon (Complex Optimization & Reasoning)
                  </option>
                  <option value="gemini-3.8-flash">
                    gemini-3.8-flash (General Dispatch Operations)
                  </option>
                  <option value="gemini-3.1-flash-lite">
                    gemini-3.1-flash-lite (Fast Low-Latency Lookup)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] mb-1">
                  System Instruction Role Persona
                </label>
                <select
                  value={selectedPersona}
                  onChange={(e) =>
                    setSelectedPersona(e.target.value as PersonaId)
                  }
                  className="w-full px-2.5 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs text-[var(--text-main)]"
                >
                  <option value="dispatch_commander">
                    Chief Dispatch Commander (SLA & Fleet Control)
                  </option>
                  <option value="disruption_strategist">
                    Disruption Recovery Strategist (Plan A/B/C)
                  </option>
                  <option value="route_economist">
                    Fleet & Route Economist (Cost & Utilization)
                  </option>
                </select>
              </div>
            </div>

            {/* Quick Prompt Starters */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {[
                'Analyze V-03 breakdown impact on DEL-105, DEL-106, DEL-107',
                'Which available vehicles have capacity for a 350kg urgent order?',
                'Compare Minimum Cost vs Minimum Delay trade-offs',
              ].map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => handleSendChat(starter)}
                  disabled={isChatLoading}
                  className="px-2.5 py-1 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Message Thread */}
          <div
            ref={chatScrollRef}
            className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[var(--bg-primary)]/40"
          >
            {chatTurns.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.role === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-lg p-3.5 text-xs leading-relaxed whitespace-pre-wrap ${
                    turn.role === 'user'
                      ? 'bg-[var(--accent-primary)] text-[var(--accent-contrast)] font-medium'
                      : 'bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-main)]'
                  }`}
                >
                  {turn.text}
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-[var(--text-secondary)]">
                  <span>
                    {turn.role === 'user' ? 'Dispatcher' : 'LogiMind Copilot'}
                  </span>
                  <span>·</span>
                  <span>{turn.timestamp}</span>
                  {turn.modelUsed && (
                    <>
                      <span>·</span>
                      <span className="text-[var(--accent-primary)]">
                        {turn.modelUsed}
                      </span>
                    </>
                  )}
                </div>
                {turn.fallbackNotice && (
                  <div className="mt-1 text-[10px] text-amber-400 font-mono">
                    {turn.fallbackNotice}
                  </div>
                )}
              </div>
            ))}

            {isChatLoading && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)] font-mono p-2">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
                <span>
                  Running {selectedModel} ({selectedPersona})...
                </span>
              </div>
            )}

            {chatError && (
              <div className="p-3 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                {chatError}
              </div>
            )}
          </div>

          {/* Chat Input Box */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendChat();
            }}
            className="p-3.5 border-t border-[var(--border-color)] flex items-center gap-2"
          >
            <MessageSquare className="w-4 h-4 text-[var(--text-secondary)] shrink-0 ml-1" />
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about delivery SLAs, vehicle capacities, or disruption recovery plans..."
              className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)] focus:outline-none focus:border-[#4CC9FF]"
            />
            <button
              type="submit"
              disabled={isChatLoading || !chatInput.trim()}
              className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Right Column: Google Maps Grounding + Google Search Grounding */}
        <div className="xl:col-span-5 space-y-6">
          {/* Google Maps Grounding Card */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  Google Maps Grounding
                </h3>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                gemini-3.8-flash + googleMaps
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Find verified real-world freight hubs, commercial vehicle service
              centers, and staging depots with grounded Google Maps place links.
            </p>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--text-secondary)] bg-[var(--bg-primary)] px-3 py-1.5 rounded border border-[var(--border-color)]">
              <span>{geoStatus}</span>
              <button
                type="button"
                onClick={handleUseBrowserGeolocation}
                className="text-[var(--accent-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Navigation className="w-3 h-3" />
                <span>Use My GPS</span>
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={mapsQuery}
                onChange={(e) => setMapsQuery(e.target.value)}
                placeholder="Search freight hubs, truck repair, or staging depots..."
                className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)]"
              />
              <button
                type="button"
                onClick={() => handleRunMapsGrounding()}
                disabled={isMapsLoading}
                className="px-3.5 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isMapsLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Compass className="w-3.5 h-3.5" />
                )}
                <span>Query Maps</span>
              </button>
            </div>

            {mapsError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                {mapsError}
              </div>
            )}

            {mapsResult && (
              <div className="space-y-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md p-3 max-h-60 overflow-y-auto text-xs">
                <div className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">
                  {mapsResult.text}
                </div>

                {mapsResult.sources.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
                    <div className="text-[11px] font-semibold text-emerald-400">
                      Grounded Google Maps Places ({mapsResult.sources.length}):
                    </div>
                    {mapsResult.sources.map((src, i) => (
                      <div key={i} className="space-y-1">
                        <a
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-primary)] hover:underline font-medium"
                        >
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{src.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                        {src.reviewSnippets &&
                          src.reviewSnippets.map((snip, idx) => (
                            <p
                              key={idx}
                              className="pl-4 text-[11px] text-[var(--text-secondary)] italic"
                            >
                              "{snip}"
                            </p>
                          ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Google Search Grounding Card */}
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[var(--accent-primary)]" />
                <h3 className="text-sm font-semibold text-[var(--text-main)]">
                  Google Search Grounding
                </h3>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                gemini-3.8-flash + googleSearch
              </span>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Retrieve live web intelligence on highway traffic disruptions,
              weather advisories, port congestion, and freight corridor alerts.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Query live highway traffic, weather, or supply chain news..."
                className="flex-1 px-3 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)]"
              />
              <button
                type="button"
                onClick={() => handleRunSearchGrounding()}
                disabled={isSearchLoading}
                className="px-3.5 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSearchLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Globe className="w-3.5 h-3.5" />
                )}
                <span>Search Web</span>
              </button>
            </div>

            {searchError && (
              <div className="p-2.5 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
                {searchError}
              </div>
            )}

            {searchResult && (
              <div className="space-y-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md p-3 max-h-60 overflow-y-auto text-xs">
                <div className="text-[var(--text-main)] whitespace-pre-wrap leading-relaxed">
                  {searchResult.text}
                </div>

                {searchResult.sources.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border-color)] space-y-1.5">
                    <div className="text-[11px] font-semibold text-[var(--accent-primary)]">
                      Verified Web Sources ({searchResult.sources.length}):
                    </div>
                    <div className="flex flex-col gap-1">
                      {searchResult.sources.map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent-primary)] hover:underline truncate"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate">{src.title}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Panel: Lyria 3 Command Center Audio & Acoustic Ambience Generator */}
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <Music className="w-4 h-4 text-[var(--accent-primary)]" />
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-main)]">
                Command Center Audio & Acoustic Ambience Generator (Lyria 3)
              </h3>
              <p className="text-xs text-[var(--text-secondary)]">
                Synthesize custom dispatch room focus soundtracks or coastal
                corridor acoustic themes using{' '}
                <code className="font-mono text-[var(--accent-primary)]">
                  lyria-3-clip-preview
                </code>{' '}
                (30s clips) or{' '}
                <code className="font-mono text-[var(--accent-primary)]">
                  lyria-3-pro-preview
                </code>{' '}
                (full tracks).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={musicModel}
              onChange={(e) =>
                setMusicModel(
                  e.target.value as
                    | 'lyria-3-clip-preview'
                    | 'lyria-3-pro-preview'
                )
              }
              className="px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded text-xs font-mono text-[var(--text-main)]"
            >
              <option value="lyria-3-clip-preview">
                lyria-3-clip-preview (30s Clip)
              </option>
              <option value="lyria-3-pro-preview">
                lyria-3-pro-preview (Full Track)
              </option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {[
            'Calm ambient electronic focus soundtrack for night shift logistics dispatchers',
            'Cinematic coastal highway synthwave with warm Tamil Nadu sunrise percussion',
            'High-tempo incident recovery command pulse with crisp modular arpeggios',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleGenerateMusic(preset)}
              disabled={isMusicLoading}
              className="px-3 py-1 rounded bg-[var(--bg-primary)] hover:bg-[var(--bg-elevated)] border border-[var(--border-color)] text-[11px] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] transition-colors cursor-pointer"
            >
              {preset}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={musicPrompt}
            onChange={(e) => setMusicPrompt(e.target.value)}
            placeholder="Describe the dispatch center soundtrack or audio clip to generate..."
            className="flex-1 px-3.5 py-2 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-md text-xs text-[var(--text-main)]"
          />
          <button
            type="button"
            onClick={() => handleGenerateMusic()}
            disabled={isMusicLoading || !musicPrompt.trim()}
            className="px-4 py-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-secondary)] text-[var(--accent-contrast)] font-semibold text-xs rounded-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
          >
            {isMusicLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Synthesizing Audio...</span>
              </>
            ) : (
              <>
                <Volume2 className="w-4 h-4" />
                <span>Generate Audio Track</span>
              </>
            )}
          </button>
        </div>

        {musicError && (
          <div className="p-3 rounded bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200">
            {musicError}
          </div>
        )}

        {musicResult && (
          <div className="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-main)] flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-[var(--accent-primary)]" />
                <span>Generated Dispatch Audio Stream</span>
              </span>
              <span className="font-mono text-[11px] text-emerald-400">
                {musicResult.modelUsed}
              </span>
            </div>
            <audio
              controls
              src={musicResult.audioDataUrl}
              className="w-full h-10"
            />
            {musicResult.lyrics && (
              <div className="text-xs text-[var(--text-secondary)] whitespace-pre-wrap border-t border-[var(--border-color)] pt-2">
                {musicResult.lyrics}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIIntelligenceHubView;
