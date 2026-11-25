export type EffortMode = "none" | "thinking" | "budget" | "effort";
export type ReasoningEffort = "low" | "medium" | "high";
export type ProviderRequestOptions = {
  chat_template_kwargs?: { enable_thinking: boolean };
  reasoning_budget?: number;
  reasoning_effort?: string;
};
export type ModelOption = {
  id: string;
  label: string;
  description: string;
  effortMode: EffortMode;
};

export const DEFAULT_MODEL_ID = "nvidia/nemotron-3.5-bolt-e4b";
export const DEFAULT_EFFORT: ReasoningEffort = "medium";
export const EFFORTS: readonly ReasoningEffort[] = ["low", "medium", "high"];

export const MODEL_OPTIONS: readonly ModelOption[] = [
  {
    id: "nvidia/nemotron-3.5-bolt-e4b",
    label: "Nemotron 3.5 Bolt",
    description: "Compact reasoning model for everyday chat.",
    effortMode: "thinking",
  },
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    label: "Nemotron 3.5 Lightning",
    description: "Fast model for quick answers and code.",
    effortMode: "budget",
  },
  {
    id: "nvidia/nemotron-3.5-super-vl-120b-a12b",
    label: "Nemotron 3.5 Super VL",
    description: "Larger model with native effort control.",
    effortMode: "effort",
  },
  {
    id: "mistralai/mistral-large-4-1t-a52b",
    label: "Mistral Large 4",
    description: "Large model with native effort control.",
    effortMode: "effort",
  },
];

const BUDGETS: Record<ReasoningEffort, number> = {
  low: 2048,
  medium: 8192,
  high: 32768,
};

export function isSupportedModel(id: string): boolean {
  return MODEL_OPTIONS.some((option) => option.id === id);
}

export function isSupportedEffort(value: unknown): value is ReasoningEffort {
  return typeof value === "string" && EFFORTS.some((effort) => effort === value);
}

export function effortToRequestOptions(
  id: string,
  effort: ReasoningEffort,
): ProviderRequestOptions {
  const option = MODEL_OPTIONS.find((entry) => entry.id === id);
  if (!option) return {};

  switch (option.effortMode) {
    case "thinking":
      return { chat_template_kwargs: { enable_thinking: effort !== "low" } };
    case "budget":
      return { reasoning_budget: BUDGETS[effort] };
    case "effort":
      return { reasoning_effort: effort === "high" ? "high" : "low" };
    case "none":
      return {};
  }
}
