import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL_ID,
  isSupportedEffort,
  isSupportedModel,
  MODEL_OPTIONS,
  type ReasoningEffort,
} from "./model-options.ts";

export type ChatSettings = {
  modelId: string;
  effort: ReasoningEffort;
};

const STORAGE_KEY = "mishu:chat-settings";
const DRAFT_KEY = "draft";

function readEntries(): Record<string, unknown> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // malformed or unavailable storage behaves like no stored settings
  }
  return {};
}

function writeEntries(entries: Record<string, unknown>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage is a best-effort cache; it must never block a request
  }
}

function keyFor(threadId: string | null): string {
  return threadId ?? DRAFT_KEY;
}

export function loadSettings(threadId: string | null): ChatSettings {
  const entry = readEntries()[keyFor(threadId)];
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.modelId === "string" &&
      isSupportedModel(candidate.modelId) &&
      isSupportedEffort(candidate.effort)
    ) {
      return { modelId: candidate.modelId, effort: candidate.effort };
    }
  }
  return { modelId: DEFAULT_MODEL_ID, effort: DEFAULT_EFFORT };
}

export function saveSettings(threadId: string | null, settings: ChatSettings): void {
  const entries = readEntries();
  entries[keyFor(threadId)] = {
    modelId: settings.modelId,
    effort: settings.effort,
  };
  writeEntries(entries);
}

export function toRequestBody(settings: ChatSettings): {
  modelId: string;
  reasoningEffort?: ReasoningEffort;
} {
  const option = MODEL_OPTIONS.find((entry) => entry.id === settings.modelId);
  if (!option || option.effortMode === "none") {
    return { modelId: settings.modelId };
  }
  return { modelId: settings.modelId, reasoningEffort: settings.effort };
}

export function moveDraftSettings(threadId: string): void {
  const entries = readEntries();
  if (!(DRAFT_KEY in entries)) return;
  entries[threadId] = entries[DRAFT_KEY];
  writeEntries(entries);
}
