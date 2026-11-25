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
import { chithiApp } from "./chithi/routes.ts";
import { free4talkApp } from "./free4talk/routes.ts";
import { generateHourlyChithi } from "./chithi/generate.ts";
import { dbFor } from "./chithi/db.ts";
import { rollupAndPrune } from "./free4talk/db.ts";

const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

// The chat completion endpoint is generated server-side with the AI SDK so that
// the `runCommand` tool executes on the server instead of being a no-op.
const CHAT_COMPLETIONS_PATH = "/api/chat/completions";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (
        url.pathname === "/api/chithis" ||
        url.pathname.startsWith("/api/chithis/") ||
        url.pathname === "/api/free4talk" ||
        url.pathname.startsWith("/api/free4talk/")
      ) {
        if (url.pathname === "/api/free4talk" || url.pathname.startsWith("/api/free4talk/")) {
          return free4talkApp.fetch(request, env, ctx);
        }
        return chithiApp.fetch(request, env, ctx);
      }
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/chithis" || url.pathname.startsWith("/api/chithis/")) {
      return chithiApp.fetch(request, env, ctx);
    }

    if (url.pathname === "/api/free4talk" || url.pathname.startsWith("/api/free4talk/")) {
      return free4talkApp.fetch(request, env, ctx);
    }

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

    if (url.pathname.match(/^\/api\/threads\/[^/]+\/messages$/) && request.method === "PUT") {
      const threadId = url.pathname.split("/")[3];
      return handleSaveMessages(threadId, request, env);
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
  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    if (controller.cron === "0 * * * *") {
      ctx.waitUntil(
        generateHourlyChithi(dbFor(env.DB), env as unknown as Record<string, unknown>)
          .then((row) => {
            console.log("chithi: generated", row?.id ?? "slot taken");
          })
          .catch((err) => {
            console.error("chithi: generation failed", err);
          }),
      );
      ctx.waitUntil(
        (async () => {
          const { scrapeFree4Talk } = await import("./free4talk/scrape.ts");
          return scrapeFree4Talk(env);
        })()
          .then((result) => {
            console.log("free4talk: scraped", result);
          })
          .catch((err) => {
            console.error("free4talk: scrape failed", err);
          }),
      );
      return;
    }
    if (controller.cron === "10 0 * * *") {
      const yesterdayUtcDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      ctx.waitUntil(
        rollupAndPrune(env.DB, yesterdayUtcDate).catch((err) => {
          console.error("free4talk: rollup failed", err);
        }),
      );
      return;
    }
    console.warn("scheduled: unhandled cron", controller.cron);
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
      "SELECT id, role, content, parts, created_at FROM messages WHERE thread_id = ? ORDER BY created_at ASC"
    )
      .bind(threadId)
      .all();
    const decoded = messages.map((row) => {
      let parts: unknown[] | null = null;
      if (typeof row.parts === "string") {
        try {
          const parsed = JSON.parse(row.parts) as unknown;
          if (Array.isArray(parsed)) parts = parsed;
        } catch {
          parts = null;
        }
      }
      return { ...row, parts };
    });
    return new Response(JSON.stringify({ ...thread, messages: decoded }), {
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

async function handleSaveMessages(threadId: string, request: Request, env: Env): Promise<Response> {
  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const allowedRoles = new Set(["user", "assistant", "system", "tool"]);
  const rawMessages = body.messages;
  if (!Array.isArray(rawMessages)) {
    return jsonError("messages must be an array", 400);
  }
  const messages: Array<{ id: string; role: string; content: string; parts: unknown[] }> = [];
  for (const item of rawMessages) {
    const message = item as Record<string, unknown>;
    if (
      typeof message?.id !== "string" ||
      typeof message.role !== "string" ||
      !allowedRoles.has(message.role) ||
      typeof message.content !== "string" ||
      !Array.isArray(message.parts)
    ) {
      return jsonError("Invalid message", 400);
    }
    messages.push({
      id: message.id,
      role: message.role,
      content: message.content,
      parts: message.parts,
    });
  }

  try {
    const thread = await env.DB.prepare("SELECT id FROM threads WHERE id = ?")
      .bind(threadId)
      .first();
    if (!thread) {
      return jsonError("Thread not found", 404);
    }

    const now = Date.now();
    const title = messages.find((message) => message.role === "user")?.content.trim().slice(0, 120) ?? "";
    const statements = [
      env.DB.prepare("DELETE FROM messages WHERE thread_id = ?").bind(threadId),
      ...messages.map((message, index) =>
        env.DB.prepare(
          "INSERT INTO messages (id, thread_id, role, content, parts, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(message.id, threadId, message.role, message.content, JSON.stringify(message.parts), now + index),
      ),
      env.DB.prepare("UPDATE threads SET updated_at = ? WHERE id = ?").bind(now, threadId),
      env.DB.prepare(
        "UPDATE threads SET title = CASE WHEN title = 'New Thread' AND ? != '' THEN ? ELSE title END WHERE id = ?"
      ).bind(title, title, threadId),
    ];
    await env.DB.batch(statements);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (err) {
    return jsonError(String(err), 500);
  }
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
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
    system: "You are a helpful assistant. Keep responses small and concise. Do not explain more than necessary.",
    providerOptions: { nvidia: requestOptions },
    maxOutputTokens: 2048,
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
