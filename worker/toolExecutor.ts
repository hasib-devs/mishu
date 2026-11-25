/**
 * Result returned by a tool executor for a single command.
 */
export interface CommandResult {
  /** Combined standard output of the command. */
  stdout: string;
  /** Combined standard error of the command. */
  stderr: string;
  /** The process exit code (0 on success). */
  exitCode: number;
  /** Whether the command was killed by the timeout. */
  timedOut: boolean;
  /** A human readable error when the command could not run at all. */
  error: string | null;
}

/** A command executor that runs shell commands with security boundaries. */
export interface ToolExecutor {
  /** Execute a command and return its result.
   * @throws never — failures are normalised into a { exitCode, stderr, error } result so the UI can render the real outcome.
   */
  execute(command: string): Promise<CommandResult>;
}

/** Safe command names available to the agent. Extend as needed for your workflow. */
const ALLOWED_COMMANDS: readonly string[] = [
  "ls",
  "cat",
  "find",
  "grep",
  "echo",
  "pwd",
  "which",
  "head",
  "tail",
  "node",
  "npm",
  "pnpm",
  "npx",
  "git",
  "tsc",
  "vite",
  "vitest",
  "bash",
  "sh",
  "curl",
  "env",
  "clear",
  "true",
  "false",
];


function parseCommand(command: string): string {
  const trimmed = command.trim();
  return trimmed.split(/\s+/)[0] ?? "";
}

function isAllowedCommand(base: string, allowlist: readonly string[]): boolean {
  return allowlist.some((c) => c === base);
}

/** Create a shell-based tool executor.
 * @remarks
 * In a Cloudflare Worker the `child_process` module is not available, so
 * `execute` returns a typed error (`exitCode: 1`,
 * `error: "shell execution is not supported in this runtime"`) rather than
 * fabricating output. To run commands for real, deploy this tool against a
 * Node.js-compatible runner that allows subprocesses (e.g. a separate worker /
 * Cloudflare Task / local dev server).
 */
export function createShellExecutor({
  allowlist = ALLOWED_COMMANDS,
}: {
  allowlist?: readonly string[];
} = {}): ToolExecutor {
  return {
    async execute(command: string): Promise<CommandResult> {
      const base = parseCommand(command);
      if (!base) {
        return { stdout: "", stderr: "", exitCode: 1, timedOut: false, error: "empty command" };
      }
      if (!isAllowedCommand(base, allowlist)) {
        return {
          stdout: "",
          stderr: `command not allowed: ${base}`,
          exitCode: 1,
          timedOut: false,
          error: null,
        };
      }

      // Cloudflare Workers do not support spawning subprocesses.
      return {
        stdout: "",
        stderr: "shell execution is not supported in this runtime",
        exitCode: 1,
        timedOut: false,
        error: "shell execution is not supported in this runtime",
      };
    },
  };
}

/** Default executor, ready for injection into `worker/index.ts`. */
export const shellExecutor = createShellExecutor();

/** Convenience executor that wraps executeCommand for the runCommand tool. */
export function executeCommand(command: string): Promise<CommandResult> {
  return shellExecutor.execute(command);
}
