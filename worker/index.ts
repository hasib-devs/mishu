import { chithiApp } from "./chithi/routes.ts";
import { free4talkApp } from "./free4talk/routes.ts";
import { chithiLinksApp } from "./chithi-links/routes.ts";
import { runChithiLinkPipeline } from "./chithi-links/pipeline.ts";
import { generateHourlyChithi } from "./chithi/generate.ts";
import { dbFor } from "./chithi/db.ts";
import { rollupAndPrune } from "./free4talk/db.ts";
import { CORS_HEADERS } from "./http.ts";
import { CRON_DAILY, CRON_HOURLY } from "./schedule.ts";
import { handleSchedule } from "./schedule-route.ts";
import { CHAT_COMPLETIONS_PATH, NVIDIA_BASE, handleChatCompletions } from "./chat.ts";
import {
  handleAddMessage,
  handleCreateThread,
  handleDeleteThread,
  handleGetThread,
  handleListThreads,
  handleSaveMessages,
} from "./threads.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (
        url.pathname === "/api/chithis" ||
        url.pathname.startsWith("/api/chithis/") ||
        url.pathname === "/api/free4talk" ||
        url.pathname.startsWith("/api/free4talk/") ||
        url.pathname === "/api/chithi-links" ||
        url.pathname.startsWith("/api/chithi-links/")
      ) {
        if (url.pathname === "/api/chithi-links" || url.pathname.startsWith("/api/chithi-links/")) {
          return chithiLinksApp.fetch(request, env, ctx);
        }
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

    if (url.pathname === "/api/chithi-links" || url.pathname.startsWith("/api/chithi-links/")) {
      return chithiLinksApp.fetch(request, env, ctx);
    }

    if (url.pathname === "/api/schedule" && request.method === "GET") {
      return handleSchedule();
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
    if (controller.cron === CRON_HOURLY) {
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
          const result = await scrapeFree4Talk(env);
          console.log("free4talk: scraped", result);
          const links = await runChithiLinkPipeline(env, env.DB);
          console.log("chithi-links: pipeline", links);
        })().catch((err) => {
          console.error("free4talk/chithi-links: post-scrape failed", err);
        }),
      );
      return;
    }
    if (controller.cron === CRON_DAILY) {
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
