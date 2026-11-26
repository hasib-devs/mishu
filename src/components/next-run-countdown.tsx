import { useNextRun } from "@/hooks/use-next-run";
import type { ScheduleJobId } from "@/lib/schedule-api";
import { formatCountdown } from "@/lib/schedule-format";

type NextRunCountdownProps = {
  jobId: ScheduleJobId;
  label: string;
};

export function NextRunCountdown({ jobId, label }: NextRunCountdownProps) {
  const { remainingMs, nextRunAt, isLoading, isError } = useNextRun(jobId);

  const text = isError
    ? "⏱ Schedule unavailable"
    : isLoading || remainingMs === null
      ? `⏱ Next ${label}: —`
      : `⏱ Next ${label} in ${formatCountdown(remainingMs)}`;

  const title = nextRunAt === null ? undefined : `Next run at ${new Date(nextRunAt).toISOString()}`;

  return (
    <span
      aria-live="off"
      title={title}
      className="inline-flex items-center whitespace-nowrap rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
    >
      {text}
    </span>
  );
}
