import * as React from "react";
import { Link, useLocation } from "react-router";
import { useQuery } from "@tanstack/react-query";

import { NextRunCountdown } from "@/components/next-run-countdown";
import { Button } from "@/components/ui/button";
import {
  fetchLatest,
  fetchSnapshots,
  fetchLanguages,
  fetchTopOwners,
  fetchTopUsers,
  fetchRooms,
} from "@/lib/free4talk-api";
import type { F4tRoom } from "@/lib/free4talk-api";

export function Free4TalkPage() {
  const location = useLocation();
  const latestQ = useQuery({ queryKey: ["f4t", "latest"], queryFn: fetchLatest });
  const snapshotsQ = useQuery({ queryKey: ["f4t", "snapshots"], queryFn: () => fetchSnapshots(24) });
  const languagesQ = useQuery({ queryKey: ["f4t", "languages"], queryFn: () => fetchLanguages(7) });
  const ownersQ = useQuery({ queryKey: ["f4t", "owners"], queryFn: () => fetchTopOwners(20) });
  const usersQ = useQuery({ queryKey: ["f4t", "users"], queryFn: () => fetchTopUsers(20) });

  void languagesQ;

  const [language, setLanguage] = React.useState("");
  const [level, setLevel] = React.useState("");
  const [q, setQ] = React.useState("");

  const roomsQ = useQuery({
    queryKey: ["f4t", "rooms", language, level, q],
    queryFn: () => fetchRooms({ language: language || undefined, level: level || undefined, q: q || undefined }),
  });

  const latest = latestQ.data ?? null;
  const rooms = React.useMemo(() => latest?.rooms ?? [], [latest]);

  const languages = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) if (r.language) set.add(r.language);
    return Array.from(set).sort();
  }, [rooms]);

  const levels = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) if (r.level) set.add(r.level);
    return Array.from(set).sort();
  }, [rooms]);

  const langCounts = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rooms) m.set(r.language, (m.get(r.language) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rooms]);

  const distinctOwners = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of rooms) set.add(r.ownerId);
    return set.size;
  }, [rooms]);

  const snapshots = snapshotsQ.data ?? [];

  return (
    <div className="h-dvh w-full overflow-y-auto bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Free4Talk Community</h1>
            <p className="text-sm text-muted-foreground">Live community rooms.</p>
          </div>
          <div className="flex items-center gap-2">
            <NextRunCountdown jobId="hourly" label="scrape" />
            <Button variant="outline" nativeButton={false} render={<Link to={{ pathname: "/", search: location.search }}>Back to chat</Link>} />
          </div>
        </header>

        {latestQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {latestQ.isError && (
          <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
            {latestQ.error instanceof Error ? latestQ.error.message : "Failed to load"}
          </p>
        )}

        {!latestQ.isLoading && !latest && (
          <div className="rounded-2xl border border-dashed py-20 text-center">
            <p className="text-sm text-muted-foreground">No snapshots yet — the first scrape runs at the next hourly cron</p>
          </div>
        )}

        {latest && (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Rooms" value={latest.snapshot.totalRooms} />
              <KpiCard label="Participants" value={latest.snapshot.totalParticipants} />
              <KpiCard label="Languages" value={langCounts.length} />
              <KpiCard label="Owners" value={distinctOwners} />
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Hourly activity</h2>
              {snapshotsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {snapshotsQ.isError && <p className="text-sm text-destructive">Failed to load snapshots</p>}
              <HourlyChart snapshots={snapshots} />
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Language distribution</h2>
              <div className="flex flex-col gap-2">
                {langCounts.map(([lang, count]) => {
                  const pct = rooms.length ? (count / rooms.length) * 100 : 0;
                  return (
                    <div key={lang} className="flex items-center gap-3 text-sm">
                      <span className="w-24 truncate">{lang}</span>
                      <div className="h-2 flex-1 rounded bg-muted">
                        <div className="h-2 rounded bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-12 text-right text-muted-foreground">{count}</span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Top owners</h2>
              {ownersQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {ownersQ.isError && <p className="text-sm text-destructive">Failed to load</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">Owner</th>
                    <th className="py-1">Rooms</th>
                    <th className="py-1">Participants</th>
                  </tr>
                </thead>
                <tbody>
                  {(ownersQ.data ?? []).map((o) => (
                    <tr key={o.ownerId} className="border-t">
                      <td className="py-1">{o.ownerName}</td>
                      <td className="py-1">{o.rooms}</td>
                      <td className="py-1">{o.participants}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Top users</h2>
              {usersQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {usersQ.isError && <p className="text-sm text-destructive">Failed to load</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">Name</th>
                    <th className="py-1">Followers</th>
                    <th className="py-1">Friends</th>
                    <th className="py-1">Rooms</th>
                  </tr>
                </thead>
                <tbody>
                  {(usersQ.data ?? []).map((u) => (
                    <tr key={u.userId} className="border-t">
                      <td className="py-1">{u.name}</td>
                      <td className="py-1">{u.followers}</td>
                      <td className="py-1">{u.friends}</td>
                      <td className="py-1">{u.rooms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-2xl border bg-card p-4 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Rooms</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded border px-2 py-1 text-sm">
                  <option value="">All languages</option>
                  {languages.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <select value={level} onChange={(e) => setLevel(e.target.value)} className="rounded border px-2 py-1 text-sm">
                  <option value="">All levels</option>
                  {levels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="rounded border px-2 py-1 text-sm" />
              </div>
              {roomsQ.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
              {roomsQ.isError && <p className="text-sm text-destructive">Failed to load</p>}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1">Topic</th>
                    <th className="py-1">Language</th>
                    <th className="py-1">Level</th>
                    <th className="py-1">People</th>
                    <th className="py-1">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {(roomsQ.data ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No rooms match filters</td></tr>
                  ) : (
                    (roomsQ.data ?? []).map((r: F4tRoom) => (
                      <tr key={r.roomId} className="border-t">
                        <td className="py-1">{r.topic}</td>
                        <td className="py-1">{r.language}</td>
                        <td className="py-1">{r.level ?? ""}</td>
                        <td className="py-1">{r.currentPeople}</td>
                        <td className="py-1">{r.ownerName}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function HourlyChart({ snapshots }: { snapshots: { scrapedAt: string; totalRooms: number; totalParticipants: number }[] }) {
  if (!snapshots || snapshots.length === 0) {
    return <p className="text-sm text-muted-foreground">No data points</p>;
  }
  const w = 600;
  const h = 160;
  const pad = 20;
  const maxRooms = Math.max(...snapshots.map((s) => s.totalRooms), 1);
  const pts = snapshots.map((s, i) => {
    const x = pad + (i / Math.max(snapshots.length - 1, 1)) * (w - 2 * pad);
    const y = h - pad - (s.totalRooms / maxRooms) * (h - 2 * pad);
    return `${x},${y}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts.join(" ")} />
    </svg>
  );
}
