export const CRON_HOURLY = "0 * * * *";
export const CRON_DAILY = "10 0 * * *";

export type ScheduleJobId = "hourly" | "daily";

export function nextRunAfter(cron: string, now: number): number {
  const [minuteField, hourField, dayField, monthField, weekdayField] = cron.trim().split(/\s+/);
  if (!minuteField || !hourField || dayField !== "*" || monthField !== "*" || weekdayField !== "*") {
    throw new Error(`Unsupported cron expression: ${cron}`);
  }

  const minute = Number(minuteField);
  const hourly = hourField === "*";
  const hour = hourly ? null : Number(hourField);
  if (
    !Number.isInteger(minute) || minute < 0 || minute > 59 ||
    (!hourly && (hour === null || !Number.isInteger(hour) || hour < 0 || hour > 23))
  ) {
    throw new Error(`Unsupported cron expression: ${cron}`);
  }

  const current = new Date(now);
  const candidate = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate(),
    hourly ? current.getUTCHours() : hour!,
    minute,
  );
  if (candidate > now) return candidate;
  return candidate + (hourly ? 3_600_000 : 86_400_000);
}
