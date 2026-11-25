import { cn } from "cn";

/** Three pulsing dots shown while the agent has not emitted its first token. */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Thinking"
      className={cn("inline-flex items-center gap-1.5 py-1", className)}
    >
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground animate-typing-dot motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  );
}
