import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchSchedule, type ScheduleJobId, type ScheduleResponse } from "@/lib/schedule-api";
import { remainingMs } from "@/lib/schedule-format";

type AnchoredSchedule = ScheduleResponse & { receivedAt: number };

export function useNextRun(jobId: ScheduleJobId) {
  const query = useQuery<AnchoredSchedule>({
    queryKey: ["schedule"],
    queryFn: async () => {
      const data = await fetchSchedule();
      return { ...data, receivedAt: Date.now() };
    },
    refetchInterval: 30_000,
  });

  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = query.data;
  const nextRunAt = data?.jobs.find((job) => job.id === jobId)?.nextRunAt ?? null;
  const remaining = data !== undefined && nextRunAt !== null
    ? remainingMs(nextRunAt, data.serverNow, data.receivedAt, now)
    : null;

  return {
    remainingMs: remaining,
    nextRunAt,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
