import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export type QuoteComplete = (prompt: string) => Promise<string>;

const THEMES = [
  "kindness",
  "friendship",
  "language learning",
  "courage",
  "new beginnings",
  " gratitude",
  "curiosity",
  "quiet confidence",
];

function promptFor(theme: string): string {
  return [
    `Write one short, popular, uplifting quote about ${theme.trim()}.`,
    "It should read like a well-known saying, not a personal message.",
    "Maximum 600 characters. No attribution, no markdown, no quotation marks, no greeting, no signature.",
    "Return only the quote text.",
  ].join(" ");
}

async function defaultComplete(
  env: Record<string, unknown>,
  prompt: string,
): Promise<string> {
  const apiKey = (env.NVIDIA_API_KEY as string) || (env.VITE_NVIDIA_API_KEY as string);
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not configured");
  const model = createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    apiKey,
  }).languageModel("minimaxai/minimax-m3.1-flash");

  const result = await generateText({ model, prompt, maxOutputTokens: 300 });
  return result.text;
}

/** Generate one fresh AI quote. A random theme per call keeps quotes varied. */
export async function generateQuote(
  env: Record<string, unknown>,
  complete: QuoteComplete = (prompt) => defaultComplete(env, prompt),
): Promise<string> {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)] ?? "kindness";
  const text = (await complete(promptFor(theme))).trim();
  if (text.length === 0) throw new Error("Generated quote is empty");
  return text.slice(0, 600);
}
