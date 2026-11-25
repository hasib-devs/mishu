import axios from "axios";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = false;

const headers = {
  Authorization:
    "Bearer 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",
  Accept: stream ? "text/event-stream" : "application/json",
};

const rl = createInterface({ input: stdin, output: stdout });

const messages = [{ role: "system", content: "You are a helpful assistant." }];

async function showLoading(message: string, promise: Promise<any>) {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const interval = setInterval(() => {
    stdout.write(`\r${frames[i++ % frames.length]} ${message}`);
  }, 80);
  try {
    return await promise;
  } finally {
    clearInterval(interval);
    stdout.write("\r\x1b[K\n");
  }
}

async function sendMessage(userInput: string) {
  messages.push({ role: "user", content: userInput });

  const payload = {
    model: "nvidia/nemotron-3.5-bolt-e4b",
    messages,
    max_tokens: 1024,
    stream,
    temperature: 0.7,
    top_p: 0.9,
    frequency_penalty: 0,
    presence_penalty: 0,
    reasoning_effort: "low",
  };

  const response = await axios.post(invokeUrl, payload, {
    headers,
    responseType: stream ? "stream" : "json",
  });

  if (stream) {
    let fullContent = "";
    for await (const chunk of response.data) {
      const text = chunk.toString();
      fullContent += text;
      stdout.write(text);
    }
    stdout.write("\n");
    messages.push({ role: "assistant", content: fullContent });
  } else {
    const message = response.data.choices?.[0]?.message?.content;
    if (message) {
      console.log(`\n\n ${message}`);
      messages.push({ role: "assistant", content: message });
    }
  }
}

async function main() {
  console.log("Chat started. Type 'exit' or 'quit' to end.\n");

  while (true) {
    const input = await rl.question("You: ");
    const trimmed = input.trim();

    if (!trimmed) continue;
    if (["exit", "quit"].includes(trimmed.toLowerCase())) {
      console.log("Goodbye!");
      break;
    }

    await showLoading("Thinking...", sendMessage(trimmed));
  }

  rl.close();
}

main().catch((error) => {
  if (error.response) {
    console.error(`\nHTTP ${error.response.status}`);
    if (error.response.data?.on) {
      error.response.data.on("data", (chunk) =>
        console.error(chunk.toString()),
      );
    } else {
      console.error(error.response.data);
    }
  } else {
    console.error("\nError:", error.message);
  }
  rl.close();
  process.exit(1);
});
