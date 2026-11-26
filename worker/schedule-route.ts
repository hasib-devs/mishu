import { CORS_HEADERS } from "./http.ts";
import { CRON_DAILY, CRON_HOURLY, nextRunAfter, type ScheduleJobId } from "./schedule.ts";

export function handleSchedule(): Response {
  const serverNow = Date.now();
  const jobs: Array<{ id: ScheduleJobId; nextRunAt: number }> = [
    { id: "hourly", nextRunAt: nextRunAfter(CRON_HOURLY, serverNow) },
    { id: "daily", nextRunAt: nextRunAfter(CRON_DAILY, serverNow) },
  ];
  return new Response(JSON.stringify({ serverNow, jobs }), {
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
