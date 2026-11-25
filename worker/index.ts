const NVIDIA_BASE = "https://integrate.api.nvidia.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

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
