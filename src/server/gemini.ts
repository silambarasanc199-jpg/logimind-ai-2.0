import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { getFullSystemState } from '../db/logistics.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please check the Settings > Secrets panel.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export type ChatModelTier =
  | 'gemini-4-argon'
  | 'gemini-3.8-flash'
  | 'gemini-3.1-flash-lite';

export type ChatRolePersona =
  | 'dispatch_commander'
  | 'disruption_strategist'
  | 'route_economist';

export interface ChatHistoryTurn {
  role: 'user' | 'model';
  text: string;
}

const PERSONA_INSTRUCTIONS: Record<ChatRolePersona, string> = {
  dispatch_commander:
    'You are the LogiMind AI Chief Dispatch Commander. You help logistics dispatchers monitor active deliveries, verify vehicle capacity constraints, prevent SLA violations, and coordinate fleet assignments clearly and concisely.',
  disruption_strategist:
    'You are the LogiMind AI Disruption Recovery Strategist. You specialize in analyzing vehicle breakdowns, route closures, traffic congestion, and capacity shortages, comparing Plan A (Minimum Cost), Plan B (Minimum Delay), and Plan C (Balanced Recovery) using real operational metrics.',
  route_economist:
    'You are the LogiMind AI Fleet & Route Economist. You analyze cost-per-km rates, road tortuosity factors, handover buffers, and fleet capacity utilization to minimize operational expenditure while preserving delivery SLAs.',
};

async function buildLiveOperationalContext(): Promise<string> {
  try {
    const state = await getFullSystemState();
    const vehicleSummary = state.vehicles
      .map(
        (v) =>
          `${v.id} (${v.type}): status=${v.status}, availability=${v.availability}, load=${v.current_load_kg}/${v.max_capacity_kg}kg, rate=$${v.cost_per_km}/km, speed=${v.speed_kmh}km/h, loc=${v.location_name}`
      )
      .join('\n  ');

    const deliverySummary = state.deliveries
      .map(
        (d) =>
          `${d.id}: ${d.pickup_location} -> ${d.destination} (${d.route_corridor}), weight=${d.package_weight_kg}kg, reqCap=${d.required_capacity_kg}kg, SLA=${d.deadline_label}, priority=${d.priority}, status=${d.status}, vehicle=${d.assigned_vehicle_id || 'Unassigned'}, dist=${d.estimated_distance_km}km, estTime=${d.estimated_time_mins}m`
      )
      .join('\n  ');

    const latestDisruption = state.disruptions[0];
    const disruptionSummary = latestDisruption
      ? `Latest Disruption ${latestDisruption.id}: ${latestDisruption.type} on ${latestDisruption.target_id} (${latestDisruption.severity}), decision=${latestDisruption.dispatcher_decision}, affected=${latestDisruption.affected_delivery_ids.join(', ')}`
      : 'No active disruptions recorded.';

    return `
LIVE LOGIMIND AI OPERATIONAL STATE:
- Vehicles (${state.vehicles.length}):
  ${vehicleSummary}
- Deliveries (${state.deliveries.length}):
  ${deliverySummary}
- Disruption Status:
  ${disruptionSummary}
- Settings: Road Factor=${state.settings.road_tortuosity_factor}x, Handover=${state.settings.transfer_handover_mins}m, Delay Penalty=$${state.settings.delay_penalty_per_min_usd}/min.
`;
  } catch {
    return '';
  }
}

export async function runMultiTurnChat(params: {
  message: string;
  history: ChatHistoryTurn[];
  model?: ChatModelTier;
  persona?: ChatRolePersona;
}): Promise<{
  reply: string;
  modelUsed: string;
  fallbackNotice?: string;
}> {
  const ai = getAiClient();
  const requestedModel: ChatModelTier = params.model || 'gemini-3.8-flash';
  const persona: ChatRolePersona = params.persona || 'dispatch_commander';
  const liveContext = await buildLiveOperationalContext();

  const systemInstruction = `${PERSONA_INSTRUCTIONS[persona]}\n\nAlways ground your answers in the live operational metrics below when answering questions about orders, vehicles, or recovery plans. Keep responses scannable, practical, and accurate.\n${liveContext}`;

  const formattedHistory = (params.history || []).map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.text }],
  }));

  const executeChat = async (modelName: string) => {
    const chat = ai.chats.create({
      model: modelName,
      history: formattedHistory,
      config: {
        systemInstruction,
      },
    });
    const response: GenerateContentResponse = await chat.sendMessage({
      message: params.message,
    });
    return response.text || 'No response generated.';
  };

  try {
    const reply = await executeChat(requestedModel);
    return { reply, modelUsed: requestedModel };
  } catch (err: any) {
    // If gemini-4-argon fails due to free-tier key restrictions, gracefully fall back to gemini-3.8-flash
    if (requestedModel === 'gemini-4-argon') {
      const fallbackReply = await executeChat('gemini-3.8-flash');
      return {
        reply: fallbackReply,
        modelUsed: 'gemini-3.8-flash',
        fallbackNotice:
          'Responded using gemini-3.8-flash (select a billing-enabled API key in Settings > Secrets to unlock gemini-4-argon).',
      };
    }
    throw err;
  }
}

export interface GroundingSourceLink {
  title: string;
  uri: string;
  sourceType: 'maps' | 'search';
  reviewSnippets?: string[];
}

export async function runGoogleMapsGrounding(params: {
  query: string;
  latitude?: number;
  longitude?: number;
}): Promise<{
  text: string;
  sources: GroundingSourceLink[];
  modelUsed: string;
}> {
  const ai = getAiClient();

  const hasCoords =
    typeof params.latitude === 'number' &&
    typeof params.longitude === 'number' &&
    !Number.isNaN(params.latitude) &&
    !Number.isNaN(params.longitude);

  // IMPORTANT: Do NOT set responseMimeType or responseSchema when using googleMaps
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: `${params.query}\n\nContext: Provide accurate geographical, route hub, freight access, and place details relevant to logistics dispatchers.`,
    config: {
      tools: [{ googleMaps: {} }],
      ...(hasCoords
        ? {
            toolConfig: {
              retrievalConfig: {
                latLng: {
                  latitude: params.latitude!,
                  longitude: params.longitude!,
                },
              },
            },
          }
        : {}),
    },
  });

  const sources: GroundingSourceLink[] = [];
  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  for (const chunk of chunks as any[]) {
    if (chunk?.maps?.uri) {
      const snippets: string[] = [];
      const answerSources = chunk.maps.placeAnswerSources;
      if (answerSources?.reviewSnippets && Array.isArray(answerSources.reviewSnippets)) {
        for (const snip of answerSources.reviewSnippets) {
          if (typeof snip === 'string') {
            snippets.push(snip);
          } else if (snip?.text) {
            snippets.push(String(snip.text));
          } else if (snip?.reviewText) {
            snippets.push(String(snip.reviewText));
          }
        }
      }
      sources.push({
        title: chunk.maps.title || 'Google Maps Place Link',
        uri: chunk.maps.uri,
        sourceType: 'maps',
        reviewSnippets: snippets.length > 0 ? snippets : undefined,
      });
    }
  }

  return {
    text: response.text || 'No place details returned.',
    sources,
    modelUsed: 'gemini-3.8-flash',
  };
}

export async function runGoogleSearchGrounding(params: {
  query: string;
}): Promise<{
  text: string;
  sources: GroundingSourceLink[];
  modelUsed: string;
}> {
  const ai = getAiClient();

  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: `${params.query}\n\nContext: Provide up-to-date logistics, highway traffic, weather, and supply chain intelligence with verified facts.`,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });

  const sources: GroundingSourceLink[] = [];
  const chunks =
    response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

  for (const chunk of chunks as any[]) {
    if (chunk?.web?.uri) {
      sources.push({
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
        sourceType: 'search',
      });
    }
  }

  return {
    text: response.text || 'No search results returned.',
    sources,
    modelUsed: 'gemini-3.8-flash',
  };
}

export async function runLyriaMusicGeneration(params: {
  prompt: string;
  model?: 'lyria-3-clip-preview' | 'lyria-3-pro-preview';
}): Promise<{
  audioDataUrl: string;
  lyrics: string;
  modelUsed: string;
}> {
  const ai = getAiClient();
  const selectedModel =
    params.model === 'lyria-3-pro-preview'
      ? 'lyria-3-pro-preview'
      : 'lyria-3-clip-preview';

  const response = await ai.models.generateContentStream({
    model: selectedModel,
    contents: params.prompt,
  });

  const audioChunks: Buffer[] = [];
  let lyrics = '';
  let mimeType = 'audio/mpeg';

  for await (const chunk of response) {
    const parts = chunk.candidates?.[0]?.content?.parts;
    if (!parts) continue;
    for (const part of parts) {
      if (part.inlineData?.data) {
        if (audioChunks.length === 0 && part.inlineData.mimeType) {
          mimeType = part.inlineData.mimeType;
        }
        audioChunks.push(Buffer.from(part.inlineData.data, 'base64'));
      }
      if (part.text) {
        lyrics += part.text;
      }
    }
  }

  if (audioChunks.length === 0) {
    throw new Error(
      `No audio stream returned from ${selectedModel}. Ensure a billing-enabled API key is selected in Settings > Secrets for Lyria music generation.`
    );
  }

  const audioBase64 = Buffer.concat(audioChunks).toString('base64');
  const audioDataUrl = `data:${mimeType};base64,${audioBase64}`;

  return {
    audioDataUrl,
    lyrics: lyrics.trim(),
    modelUsed: selectedModel,
  };
}
