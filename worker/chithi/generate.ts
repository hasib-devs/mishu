import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

import { createChithi, SlotTakenError } from "./service.ts";
import type { ChithiDb } from "./db.ts";
import type { ChithiRow } from "./schema.ts";

export type GenerateOptions = {
  now?: number;
  complete?: (prompt: string) => Promise<string>;
};

const PROMPT = [
  "Write one short letter (চিঠি) in Bengali (Bangla) for a language-learning community.",
  "Tone: warm, encouraging, friendly. One short paragraph.",
  "Maximum 600 characters. No greeting headers, no signature, no markdown.",
  "Return only the letter text.",
].join(" ");

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
  const result = await generateText({ model, prompt, maxOutputTokens: 300 });
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
  const text = (await complete(PROMPT)).trim();
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
