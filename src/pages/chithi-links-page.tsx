import * as React from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { NextRunCountdown } from "@/components/next-run-countdown";
import { Button } from "@/components/ui/button";
import { fetchChithiTargets } from "@/lib/chithi-links-api";
import type { ChithiTarget } from "@/lib/chithi-links-api";

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
        {target.source === "room_topic" ? "Room topic" : "User bio"}
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
  const targetsQ = useQuery({
    queryKey: ["chithi-links"],
    queryFn: () => fetchChithiTargets(100),
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
          <div className="flex items-center gap-2">
            <NextRunCountdown jobId="hourly" label="quotes" />
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link to={{ pathname: "/", search: location.search }}>
                  Back to chat
                </Link>
              }
            />
          </div>
        </header>

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
