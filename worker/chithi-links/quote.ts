import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";

export type QuoteComplete = (prompt: string) => Promise<string>;

export interface QuoteOptions {
  avoid?: string[];
}

const MAX_QUOTE_ATTEMPTS = 3;

export function normalizeQuote(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

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

function promptFor(theme: string, avoid: string[]): string {
  const parts = [
    `Write one short, popular, uplifting quote about ${theme.trim()}.`,
    "It should read like a well-known saying, not a personal message.",
    "Maximum 600 characters. No attribution, no markdown, no quotation marks, no greeting, no signature.",
    "Return only the quote text.",
  ];
  if (avoid.length > 0) {
    parts.push(
      `Do not repeat or paraphrase any of these quotes, already used: ${avoid.join("; ")}.`,
    );
  }
  return parts.join(" ");
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

  // Reasoning tokens count toward this budget; 300 leaves no quote text.
  const result = await generateText({ model, prompt, maxOutputTokens: 2048 });
  return result.text;
}

/**
 * Generate one fresh AI quote. The model is deterministic for a given prompt,
 * so a random theme alone repeats famous sayings; pass the quotes already used
 * in `avoid` and retry if the model still returns one of them.
 */
export async function generateQuote(
  env: Record<string, unknown>,
  complete: QuoteComplete = (prompt) => defaultComplete(env, prompt),
  options: QuoteOptions = {},
): Promise<string> {
  const avoid = (options.avoid ?? []).filter((quote) => quote.trim().length > 0);
  const used = avoid.map(normalizeQuote);
  for (let attempt = 0; attempt < MAX_QUOTE_ATTEMPTS; attempt += 1) {
    const theme = THEMES[Math.floor(Math.random() * THEMES.length)] ?? "kindness";
    const text = (await complete(promptFor(theme, avoid))).trim();
    if (text.length === 0) throw new Error("Generated quote is empty");
    if (!used.includes(normalizeQuote(text))) return text.slice(0, 600);
  }
  throw new Error("Generated quote duplicates a previously used quote");
}
