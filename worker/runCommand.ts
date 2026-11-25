import { tool } from "ai";
import { executeCommand } from "./toolExecutor.js";
import { z } from "zod";

/**
 * Defines the `runCommand` tool that the agent can request. Execution is
 * performed server-side by `toolExecutor.executeCommand`. The tool result is
 * returned to the UI so the user can see what was executed and its output.
 */
export const runCommand = tool({
  description:
    "Run a shell command in the server workspace and return its result. Only a safe allowlist of commands is supported.",
  inputSchema: z.object({
    command: z
      .string()
      .describe("The shell command to run (e.g. `ls`, `npm run build`, `cat file.txt`)."),
  }),
  execute: async (input) => {
    const result = await executeCommand(input.command);
    return {
      type: "json" as const,
      value: {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        error: result.error,
      },
    };
  },
});
