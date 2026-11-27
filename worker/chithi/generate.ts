import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

import { pickVibe } from "../ai-vibes.ts";
import { createChithi, SlotTakenError } from "./service.ts";
import type { ChithiDb } from "./db.ts";
import type { ChithiRow } from "./schema.ts";

export type GenerateOptions = {
  now?: number;
  vibe?: string;
  complete?: (prompt: string) => Promise<string>;
};

export function letterPrompt(vibe: string): string {
  return [
    "Write one short letter (চিঠি) in Bengali (Bangla).",
    `Mood/vibe: ${vibe.trim()}. Let that mood shape every line.`,
    "Warm and natural, one short paragraph. Maximum 600 characters. No greeting headers, no signature, no markdown.",
    "Return only the letter text.",
  ].join(" ");
}

export function hourStart(ms: number): number {
  return Math.floor(ms / 3_600_000) * 3_600_000;
}

async function defaultComplete(env: Record<string, unknown>, prompt: string): Promise<string> {
  const apiKey = (env.NVIDIA_API_KEY as string) || (env.VITE_NVIDIA_API_KEY as string);
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured");
  const modelId = "minimaxai/minimax-m3.1-flash";
  const model = createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
  }).languageModel(modelId);
  // minimax-m3.1-flash reasons before it writes; ~1k tokens can be spent on
  // reasoning alone, so a 300-token cap leaves no letter text at all.
  const result = await generateText({ model, prompt, maxOutputTokens: 2048 });
  return result.text;
}

export async function generateHourlyChithi(
  db: ChithiDb,
  env: Record<string, unknown>,
  options: GenerateOptions = {},
): Promise<ChithiRow | null> {
  const now = options.now ?? Date.now();
  const hour = hourStart(now);
  const complete = options.complete ?? ((prompt: string) => defaultComplete(env, prompt));
  const vibe = options.vibe ?? pickVibe();
  const text = (await complete(letterPrompt(vibe))).trim();
  if (text.length === 0) throw new Error("Generated letter is empty");
  const content = text.slice(0, 600);
  try {
    return await createChithi(db, {
      content,
      source: "ai",
      generatedFor: hour,
      paperStyle: "classic",
    });
  } catch (err) {
    if (err instanceof SlotTakenError) return null;
    throw err;
  }
}

export { SlotTakenError };
