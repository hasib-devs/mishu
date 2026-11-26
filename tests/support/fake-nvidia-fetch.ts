/**
 * Stubs only the external NVIDIA HTTP call. Everything else (AI SDK parsing,
 * prompt construction, token-budget choice, D1 write) stays real.
 *
 * The live minimax-m3.1-flash response spends most of its token budget on
 * reasoning_tokens. When the budget is too small it returns an empty `content`
 * with finish_reason "length", which is exactly what broke hourly generation.
 */
export function stubNvidiaFetch(text: string) {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ max_tokens?: number; model?: string; messages?: unknown[] }> = [];

  globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      max_tokens?: number;
      model?: string;
      messages?: unknown[];
    };
    requests.push(body);
    const budget = Number(body.max_tokens ?? 0);
    const tooSmall = budget < 1000;
    const payload = {
      id: "chatcmpl-test",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: tooSmall ? "" : text,
          refusal: null,
          reasoning_content: tooSmall
            ? "Need to answer but the output budget is exhausted."
            : "The answer is straightforward.",
        },
        finish_reason: tooSmall ? "length" : "stop",
      }],
      created: 1_795_730_000,
      model: "minimaxai/minimax-m3.1-flash",
      object: "chat.completion",
      usage: {
        prompt_tokens: 234,
        completion_tokens: tooSmall ? budget : 40,
        total_tokens: 234 + (tooSmall ? budget : 40),
        prompt_tokens_details: { cached_tokens: 128 },
        completion_tokens_details: { reasoning_tokens: tooSmall ? budget : 18 },
      },
    };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return {
    requests,
    restore: () => { globalThis.fetch = originalFetch; },
  };
}
