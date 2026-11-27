import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { Link, useLocation } from "react-router";

import { NextRunCountdown } from "@/components/next-run-countdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChithiTarget, HourlyRunResult } from "@/lib/chithi-links-api";
import { fetchChithiTargets, triggerHourlyRun } from "@/lib/chithi-links-api";
import { FeatherIcon } from "lucide-react";

function formatTime(epochMs: number | null): string {
  if (epochMs === null) return "—";
  return new Date(epochMs).toLocaleString();
}

function StatusPill({ active, sent }: { active: boolean; sent: boolean }) {
  const label = !active ? "Rejected" : sent ? "Sent" : "Pending";
  const className = !active
    ? "border-destructive/40 text-destructive"
    : sent
      ? "border-emerald-500/40 text-emerald-600"
      : "border-amber-500/40 text-amber-600";
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${className}`}
    >
      {label}
    </span>
  );
}

function TargetRow({ target }: { target: ChithiTarget }) {
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="py-3 px-4">
        <a
          className="font-medium underline-offset-2 hover:underline"
          href={`https://chithi.me/${encodeURIComponent(target.username)}`}
          target="_blank"
          rel="noreferrer"
        >
          @{target.username}
        </a>
        <div className="mt-1 text-xs text-muted-foreground">
          first seen {formatTime(target.firstSeenAt)}
        </div>
      </td>
      <td className="py-3 px-4 text-sm">
        {target.source === "room_topic" ? "Topic" : "Bio"}
      </td>
      <td className="py-3 px-4">
        <StatusPill
          active={target.active === 1}
          sent={target.lastSentAt !== null}
        />
      </td>
      <td className="py-3 pr-4 text-sm text-muted-foreground">
        {formatTime(target.lastSeenAt)}
      </td>
      <td className="py-3 px-4 text-sm">
        {target.lastQuote ? (
          <span title={target.lastQuote}>
            {target.lastQuote.length > 90
              ? `${target.lastQuote.slice(0, 90)}…`
              : target.lastQuote}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
        {target.lastError && (
          <div className="mt-1 text-xs text-destructive">
            {target.lastError}
          </div>
        )}
      </td>
    </tr>
  );
}

export function ChithiLinksPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [token, setToken] = React.useState(
    () => sessionStorage.getItem("manual-run-token") ?? "",
  );
  const [runMessage, setRunMessage] = React.useState<string | null>(null);
  const targetsQ = useQuery({
    queryKey: ["chithi-links"],
    queryFn: () => fetchChithiTargets(100),
  });
  const run = useMutation({
    mutationFn: () => triggerHourlyRun(token.trim()),
    onSuccess: (result: HourlyRunResult) => {
      sessionStorage.setItem("manual-run-token", token.trim());
      queryClient.invalidateQueries({ queryKey: ["chithi-links"] });
      const chithi = result.chithi.ok ? "letter ok" : `letter failed: ${result.chithi.error}`;
      const scrape = result.scrape.ok ? "scrape ok" : `scrape failed: ${result.scrape.error}`;
      const links = result.links.ok
        ? `${result.links.value.sent} quotes sent`
        : `links failed: ${result.links.error}`;
      setRunMessage(`${chithi} · ${scrape} · ${links}`);
    },
    onError: (err) =>
      setRunMessage(`Run failed: ${err instanceof Error ? err.message : String(err)}`),
  });
  const targets = React.useMemo(() => targetsQ.data ?? [], [targetsQ.data]);

  const sent = targets.filter((target) => target.lastSentAt !== null).length;
  const active = targets.filter((target) => target.active === 1).length;

  return (
    <div className="h-dvh w-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Chithi links
            </h1>
            <p className="text-sm text-muted-foreground">
              Valid chithi.me profiles found in free4talk room topics and user
              bios.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <NextRunCountdown jobId="hourly" label="quotes" />
            <Input
              type="password"
              aria-label="Manual run token"
              placeholder="Run token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="w-32"
            />
            <Button
              variant="outline"
              disabled={run.isPending || token.trim().length === 0}
              onClick={() => run.mutate()}
            >
              {run.isPending ? "Running…" : "Run now"}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link to={{ pathname: "/", search: location.search }}>
                  Back to chat
                </Link>
              }
            />
            <Link
              to={{ pathname: "/chithi", search: location.search }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <FeatherIcon className="size-4" />
              Chithi
            </Link>
          </div>
        </header>

        {runMessage && (
          <p role="status" className="text-sm text-muted-foreground">
            {runMessage}
          </p>
        )}

        {targetsQ.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}
        {targetsQ.isError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive"
          >
            {targetsQ.error instanceof Error
              ? targetsQ.error.message
              : "Failed to load"}
          </p>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Discovered</p>
            <p className="text-2xl font-semibold">{targets.length}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Valid profiles</p>
            <p className="text-2xl font-semibold">{active}</p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">Quotes sent</p>
            <p className="text-2xl font-semibold">{sent}</p>
          </div>
        </section>

        {!targetsQ.isLoading && targets.length === 0 ? (
          <div className="rounded-2xl border border-dashed py-20 text-center">
            <p className="text-sm text-muted-foreground">
              No chithi.me links yet — the next hourly scrape will populate this
              list.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[720px] border-collapse px-4 text-left">
              <thead>
                <tr className="text-xs tracking-wide text-muted-foreground uppercase">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Found in</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last seen</th>
                  <th className="px-4 py-3">Last quote</th>
                </tr>
              </thead>
              <tbody>
                {targets.map((target) => (
                  <TargetRow key={target.username} target={target} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
