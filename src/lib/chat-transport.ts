import type { UIMessage, UIMessageChunk } from "ai";
import type { UIDataTypes } from "ai";

export type ChatMessage = UIMessage<
  unknown,
  UIDataTypes,
  {
    runCommand: {
      input: { command: string };
      output: { stdout: string };
    };
  }
>;

const INVOKE_URL = "/api/chat/completions";
const MODEL = "nvidia/nemotron-3.5-bolt-e4b";

export const initialMessages: ChatMessage[] = [];

export function messageContent(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("");
}

export function toApiMessages(messages: ChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: messageContent(message),
  }));
}

// The worker streams AI SDK UI-message chunks. Only these types are safe to
// forward verbatim; anything else falls through to the legacy delta parser.
const FORWARDED_CHUNK_TYPES = new Set([
  "start",
  "start-step",
  "finish-step",
  "finish",
  "abort",
  "text-start",
  "text-delta",
  "text-end",
  "reasoning-start",
  "reasoning-delta",
  "reasoning-end",
  "error",
]);

function emitBlock(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  block: string,
  id: string,
  state: { textOpen: boolean },
) {
  for (const line of block.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const dataLine = line.slice(5).trim();
    if (!dataLine || dataLine === "[DONE]") continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dataLine) as Record<string, unknown>;
    } catch {
      // ignore malformed SSE data lines
      continue;
    }

    if (
      typeof parsed.type === "string" &&
      FORWARDED_CHUNK_TYPES.has(parsed.type)
    ) {
      if (parsed.type === "text-start") state.textOpen = true;
      if (parsed.type === "text-end") state.textOpen = false;
      controller.enqueue(parsed as unknown as UIMessageChunk);
      continue;
    }

    // Legacy OpenAI-style chat-completions chunk.
    const choice = (
      parsed.choices as Array<Record<string, unknown>> | undefined
    )?.[0];
    const delta =
      (choice?.delta as Record<string, unknown> | undefined)?.content ??
      (choice?.message as Record<string, unknown> | undefined)?.content;
    if (typeof delta === "string" && delta.length > 0) {
      if (!state.textOpen) {
        controller.enqueue({ type: "text-start", id });
        state.textOpen = true;
      }
      controller.enqueue({ type: "text-delta", delta, id });
    }
  }
}

export function toUiMessageChunkStream(
  body: ReadableStream<Uint8Array> | null,
  id: string,
): ReadableStream<UIMessageChunk> {
  if (!body) {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({ type: "text-start", id });
        controller.enqueue({ type: "text-end", id });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      const state = { textOpen: false };
      try {
        const reader = body.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let blockEnd: number;
            while ((blockEnd = buffer.indexOf("\n\n")) !== -1) {
              const block = buffer.slice(0, blockEnd);
              buffer = buffer.slice(blockEnd + 2);
              emitBlock(controller, block, id, state);
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) {
            emitBlock(controller, buffer, id, state);
            buffer = "";
          }
        } finally {
          reader.releaseLock();
        }
      } finally {
        if (state.textOpen) controller.enqueue({ type: "text-end", id });
        controller.close();
      }
    },
  });
}

export const transport = {
  async sendMessages({
    messages,
    abortSignal,
  }: {
    messages: ChatMessage[];
    abortSignal: AbortSignal | undefined;
  }): Promise<ReadableStream<UIMessageChunk>> {
    const id = crypto.randomUUID();

    const response = await fetch(INVOKE_URL, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: toApiMessages(messages),
        stream: true,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0,
        presence_penalty: 0,
        // max_tokens: 1024 * 2,
        // reasoning_effort: "medium",
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({ type: "start" });
          controller.enqueue({
            type: "error",
            errorText: `HTTP ${response.status}: ${errorText}`,
          });
          controller.enqueue({ type: "finish" });
          controller.close();
        },
      });
    }

    return toUiMessageChunkStream(
      response.body as ReadableStream<Uint8Array>,
      id,
    );
  },

  async reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
    return null;
  },
} satisfies { sendMessages: unknown; reconnectToStream: unknown };
