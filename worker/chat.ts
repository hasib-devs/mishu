import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  type UIMessage,
  streamText,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL_ID,
  effortToRequestOptions,
  isSupportedEffort,
  isSupportedModel,
  type ReasoningEffort,
} from "../src/lib/model-options.ts";
import { MAX_OUTPUT_TOKENS, SYSTEM_PROMPT } from "./chat-prompt.ts";
import { jsonError } from "./http.ts";

export const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

// The chat completion endpoint is generated server-side with the AI SDK so that
// the `runCommand` tool executes on the server instead of being a no-op.
export const CHAT_COMPLETIONS_PATH = "/api/chat/completions";

export async function handleChatCompletions(request: Request, env: Env): Promise<Response> {
  if (!env.VITE_NVIDIA_API_KEY) {
    return new Response("VITE_NVIDIA_API_KEY is not configured", { status: 500 });
  }

  let record: Record<string, unknown>;
  try {
    record = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  if (
    typeof record.modelId === "string" &&
    !isSupportedModel(record.modelId)
  ) {
    return jsonError("Unsupported model", 400);
  }
  if (
    typeof record.model === "string" &&
    !isSupportedModel(record.model)
  ) {
    return jsonError("Unsupported model", 400);
  }
  if (
    record.reasoningEffort !== undefined &&
    !isSupportedEffort(record.reasoningEffort)
  ) {
    return jsonError("Unsupported reasoning effort", 400);
  }

  const requestedModel =
    typeof record.modelId === "string" && record.modelId.length > 0
      ? record.modelId
      : typeof record.model === "string" && record.model.length > 0
        ? record.model
        : DEFAULT_MODEL_ID;
  const modelName = isSupportedModel(requestedModel)
    ? requestedModel
    : DEFAULT_MODEL_ID;
  const effort: ReasoningEffort = isSupportedEffort(record.reasoningEffort)
    ? record.reasoningEffort
    : DEFAULT_EFFORT;
  const requestOptions = effortToRequestOptions(modelName, effort);

  // createOpenAICompatible returns a provider; use .languageModel() to get the model
  const model = createOpenAICompatible({
    name: "nvidia",
    baseURL: NVIDIA_BASE,
    apiKey: env.VITE_NVIDIA_API_KEY,
  }).languageModel(modelName);

  const rawMessages = (record.messages ?? []) as Array<Record<string, unknown>>;
  const uiMessages = rawMessages.map((m) => {
    if (Array.isArray(m.parts)) return m as Omit<UIMessage, "id">;
    const content = typeof m.content === "string" ? m.content : "";
    return { ...m, parts: content ? [{ type: "text", text: content }] : [] } as Omit<UIMessage, "id">;
  });
  const modelMessages = await convertToModelMessages(uiMessages, { tools: {} });

  const result = streamText({
    model,
    messages: modelMessages,
    system: SYSTEM_PROMPT,
    providerOptions: { nvidia: requestOptions },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    abortSignal: request.signal,
  });

  const uiStream = result.toUIMessageStream({
    onError: () =>
      "The assistant could not complete this response. Please try again.",
  });
  const sseStream = uiStream.pipeThrough(new JsonToSseTransformStream());
  const byteStream = sseStream.pipeThrough(new TextEncoderStream());

  return new Response(byteStream, {
    headers: {
      ...UI_MESSAGE_STREAM_HEADERS,
      "Cache-Control": "no-cache",
    },
  });
}
