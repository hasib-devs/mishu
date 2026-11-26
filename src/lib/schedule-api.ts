export type ScheduleJobId = "hourly" | "daily";

export type ScheduleResponse = {
  serverNow: number;
  jobs: Array<{ id: ScheduleJobId; nextRunAt: number }>;
};

export async function fetchSchedule(): Promise<ScheduleResponse> {
  const response = await fetch("/api/schedule", {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${detail}`.trim());
  }
  return (await response.json()) as ScheduleResponse;
}
