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

function emitBlock(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  block: string,
  id: string,
) {
  let dataLine = "";
  for (const line of block.split("\n")) {
    if (line.startsWith("data: ")) {
      dataLine = line.slice(6);
    }
  }
  if (!dataLine || dataLine === "[DONE]") return;
  try {
    const parsed = JSON.parse(dataLine);
    const delta =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content;
    if (typeof delta === "string" && delta.length > 0) {
      controller.enqueue({ type: "text-delta", delta, id });
    }
  } catch {
    // ignore malformed SSE data lines
  }
}

export function toUiMessageChunkStream(
  body: ReadableStream<Uint8Array> | null,
  id: string,
): ReadableStream<UIMessageChunk> {
  if (!body) {
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue({ type: "text-start", id });
        controller.enqueue({ type: "text-end", id });
        controller.close();
      },
    });
  }

  const decoder = new TextDecoder();
  let buffer = "";

  return new ReadableStream<UIMessageChunk>({
    async start(controller) {
      controller.enqueue({ type: "text-start", id });
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
              emitBlock(controller, block, id);
            }
          }
          buffer += decoder.decode();
          if (buffer.trim()) {
            emitBlock(controller, buffer, id);
            buffer = "";
          }
        } finally {
          reader.releaseLock();
        }
      } finally {
        controller.enqueue({ type: "text-end", id });
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
        reasoning_effort: "low",
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          controller.enqueue({
            type: "error",
            errorText: `HTTP ${response.status}: ${errorText}`,
          });
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