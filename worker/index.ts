import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  convertToModelMessages,
  type UIMessage,
  streamText,
  JsonToSseTransformStream,
  UI_MESSAGE_STREAM_HEADERS,
} from "ai";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

// The chat completion endpoint is generated server-side with the AI SDK so that
// the `runCommand` tool executes on the server instead of being a no-op.
const CHAT_COMPLETIONS_PATH = "/api/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Thread management API
    if (url.pathname === "/api/threads" && request.method === "GET") {
      return handleListThreads(env);
    }
    if (url.pathname === "/api/threads" && request.method === "POST") {
      return handleCreateThread(request, env);
    }
    if (url.pathname.match(/^\/api\/threads\/[^/]+$/) && request.method === "GET") {
      const threadId = url.pathname.split("/").pop()!;
      return handleGetThread(threadId, env);
    }
    if (url.pathname.match(/^\/api\/threads\/[^/]+$/) && request.method === "DELETE") {
      const threadId = url.pathname.split("/").pop()!;
      return handleDeleteThread(threadId, env);
    }
    if (url.pathname.match(/^\/api\/threads\/[^/]+\/messages$/) && request.method === "POST") {
      const threadId = url.pathname.split("/")[3];
      return handleAddMessage(threadId, request, env);
    }

    if (url.pathname === CHAT_COMPLETIONS_PATH && request.method === "POST") {
      return handleChatCompletions(request, env);
    }

    // Preserve the legacy proxy behaviour for any other /api/* routes.
    if (url.pathname.startsWith("/api/")) {
      const upstreamUrl =
        NVIDIA_BASE + url.pathname.replace(/^\/api/, "/v1") + url.search;
      const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers: request.headers,
        body:
          request.method === "GET" || request.method === "HEAD"
            ? undefined
            : request.body,
      });
      const headers = new Headers(upstream.headers);
      for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;


async function handleListThreads(env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, title, created_at, updated_at FROM threads ORDER BY updated_at DESC"
    ).all();
    return new Response(JSON.stringify(results), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function handleCreateThread(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { title?: string };
    const id = crypto.randomUUID();
    const now = Date.now();
    const title = body.title || "New Thread";
    await env.DB.prepare(
      "INSERT INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)"
    )
      .bind(id, title, now, now)
      .run();
    return new Response(JSON.stringify({ id, title, created_at: now, updated_at: now }), {
      status: 201,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function handleGetThread(threadId: string, env: Env): Promise<Response> {
  try {
    const thread = await env.DB.prepare(
      "SELECT id, title, created_at, updated_at FROM threads WHERE id = ?"
    )
      .bind(threadId)
      .first();
    if (!thread) {
      return new Response(JSON.stringify({ error: "Thread not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...CORS_HEADERS },
      });
    }
    const { results: messages } = await env.DB.prepare(
      "SELECT id, role, content, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC"
    )
      .bind(threadId)
      .all();
    return new Response(JSON.stringify({ ...thread, messages }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function handleDeleteThread(threadId: string, env: Env): Promise<Response> {
  try {
    await env.DB.prepare("DELETE FROM messages WHERE thread_id = ?").bind(threadId).run();
    await env.DB.prepare("DELETE FROM threads WHERE id = ?").bind(threadId).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function handleAddMessage(threadId: string, request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as { role: string; content: string };
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO messages (id, thread_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(id, threadId, body.role, body.content, now)
      .run();
    await env.DB.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").bind(now, threadId).run();
    return new Response(JSON.stringify({ id, thread_id: threadId, role: body.role, content: body.content, created_at: now }), {
      status: 201,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }
}

async function handleChatCompletions(request: Request, env: Env): Promise<Response> {
  if (!env.VITE_NVIDIA_API_KEY) {
    return new Response("VITE_NVIDIA_API_KEY is not configured", { status: 500 });
  }

  let record: Record<string, unknown>;
  try {
    record = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const modelName =
    typeof record.model === "string" && record.model.length > 0
      ? record.model
      : DEFAULT_MODEL;

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
  });

  const uiStream = result.toUIMessageStream();
  const sseStream = uiStream.pipeThrough(new JsonToSseTransformStream());
  const byteStream = sseStream.pipeThrough(new TextEncoderStream());

  return new Response(byteStream, {
    headers: {
      ...UI_MESSAGE_STREAM_HEADERS,
      "Cache-Control": "no-cache",
    },
  });
}
