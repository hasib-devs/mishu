import { CORS_HEADERS, jsonError } from "./http.ts";

export async function handleListThreads(env: Env): Promise<Response> {
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

export async function handleCreateThread(request: Request, env: Env): Promise<Response> {
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

export async function handleGetThread(threadId: string, env: Env): Promise<Response> {
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

export async function handleDeleteThread(threadId: string, env: Env): Promise<Response> {
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

export async function handleAddMessage(threadId: string, request: Request, env: Env): Promise<Response> {
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

export async function handleSaveMessages(threadId: string, request: Request, env: Env): Promise<Response> {
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
