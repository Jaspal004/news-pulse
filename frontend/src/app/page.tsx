"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, TimelineCluster } from "@/lib/api";
import TimelineChart from "@/components/TimelineChart";
import ClusterPanel from "@/components/ClusterPanel";
import SourceFilter from "@/components/SourceFilter";
import RefreshButton from "@/components/RefreshButton";
import { formatDistanceToNow } from "date-fns";

const ALL_SOURCES = new Set(["BBC News", "NPR", "Reuters"]);
const AUTO_REFRESH_MS = 5 * 60 * 1000;  // stretch goal: poll every 5 min

export default function HomePage() {
  const [clusters, setClusters]     = useState<TimelineCluster[]>([]);
  const [updatedAt, setUpdatedAt]   = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sources, setSources]       = useState<Set<string>>(new Set(ALL_SOURCES));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTimeline = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getTimeline();
      setClusters(res.clusters);
      setUpdatedAt(res.updatedAt);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTimeline();
    // Auto-refresh (stretch goal)
    timerRef.current = setInterval(fetchTimeline, AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchTimeline]);

  // Filter clusters by active sources
  const filtered = useMemo(() => {
    if (sources.size === ALL_SOURCES.size) return clusters;
    return clusters.filter((c) =>
      c.sources.some((s) => sources.has(s))
    );
  }, [clusters, sources]);

  const stats = useMemo(() => ({
    total:    filtered.length,
    articles: filtered.reduce((sum, c) => sum + c.articleCount, 0),
  }), [filtered]);

  return (
    <div className="min-h-screen bg-ink text-paper font-body">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display font-extrabold text-xl tracking-tight text-paper">
              News<span className="text-signal">Pulse</span>
            </h1>
            <span className="text-[11px] font-mono text-muted border border-border rounded px-2 py-0.5">
              LIVE
            </span>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <SourceFilter active={sources} onChange={setSources} />
            <RefreshButton onDone={fetchTimeline} />
          </div>
        </div>
      </header>

      {/* ── Stats bar ───────────────────────────────────────────── */}
      <div className="border-b border-border px-6 py-2.5 bg-white/[0.015]">
        <div className="max-w-6xl mx-auto flex items-center gap-6 text-[11px] font-mono text-muted">
          <span>
            <span className="text-signal font-medium">{stats.total}</span> clusters
          </span>
          <span>
            <span className="text-paper font-medium">{stats.articles}</span> articles
          </span>
          {updatedAt && (
            <span>
              Last updated{" "}
              <span className="text-paper">
                {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
              </span>
            </span>
          )}
          <span className="ml-auto hidden sm:block">
            Auto-refreshes every 5 min
          </span>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* Timeline section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <h2 className="font-display font-bold text-sm uppercase tracking-widest text-muted">
              Topic Timeline
            </h2>
            <div className="flex-1 h-px bg-border" />
            <span className="text-[10px] font-mono text-muted/60">
              Click a cluster to explore articles
            </span>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-5 flex-wrap">
            {[
              { src: "BBC News", color: "#C8102E" },
              { src: "NPR",      color: "#3E86C1" },
              { src: "Reuters",  color: "#FF6900" },
            ].filter(({ src }) => sources.has(src)).map(({ src, color }) => (
              <div key={src} className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
                <span className="w-6 h-2 rounded-full" style={{ backgroundColor: color, opacity: 0.7 }} />
                {src}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted ml-auto">
              <span className="text-[10px]">Bar height = article count</span>
            </div>
          </div>

          {/* Timeline chart */}
          <div className="rounded-2xl border border-border bg-white/[0.02] px-4 py-6">
            {loading ? (
              <div className="h-[340px] flex flex-col items-center justify-center gap-3">
                <svg className="w-6 h-6 animate-spin text-signal" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"
                    strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round"/>
                </svg>
                <span className="text-muted font-mono text-sm">Loading timeline…</span>
              </div>
            ) : error ? (
              <div className="h-[340px] flex flex-col items-center justify-center gap-3 text-center">
                <span className="text-2xl">⚡</span>
                <p className="text-muted font-mono text-sm max-w-sm">
                  Couldn't reach the API: <span className="text-red-400">{error}</span>
                </p>
                <button
                  onClick={fetchTimeline}
                  className="text-xs font-mono text-signal hover:underline mt-1"
                >
                  Try again
                </button>
              </div>
            ) : (
              <TimelineChart
                clusters={filtered}
                onSelect={setSelectedId}
                selectedId={selectedId}
              />
            )}
          </div>
        </section>

        {/* Empty state when filter hides all */}
        {!loading && !error && filtered.length === 0 && clusters.length > 0 && (
          <div className="mt-8 text-center text-muted font-mono text-sm">
            No clusters match the selected sources.{" "}
            <button onClick={() => setSources(new Set(ALL_SOURCES))} className="text-signal hover:underline">
              Show all
            </button>
          </div>
        )}

        {/* Zero data state */}
        {!loading && !error && clusters.length === 0 && (
          <div className="mt-8 text-center space-y-3">
            <p className="text-muted font-mono text-sm">No data yet — run the pipeline to fetch articles.</p>
            <p className="text-muted/60 font-mono text-xs">
              Click "Refresh Data" above, or run <code className="bg-border px-1 py-0.5 rounded">python scraper/main.py</code>
            </p>
          </div>
        )}

        {/* Cluster list (below chart, acts as index) */}
        {!loading && filtered.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="font-display font-bold text-sm uppercase tracking-widest text-muted">
                All Clusters
              </h2>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filtered.map((cluster) => {
                const isSelected = cluster.id === selectedId;
                return (
                  <button
                    key={cluster.id}
                    onClick={() => setSelectedId(cluster.id)}
                    className={`
                      text-left rounded-xl border p-4 transition-all duration-200
                      ${isSelected
                        ? "border-signal bg-signal/5 shadow-[0_0_20px_rgba(232,255,71,0.08)]"
                        : "border-border bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className={`font-display font-semibold text-sm leading-snug ${isSelected ? "text-signal" : "text-paper"}`}>
                        {cluster.label}
                      </h3>
                      <span className={`
                        shrink-0 font-mono text-[11px] px-2 py-0.5 rounded-full
                        ${isSelected ? "bg-signal text-ink" : "bg-white/10 text-muted"}
                      `}>
                        {cluster.articleCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cluster.sources.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-mono text-muted/70"
                          style={{ color: `${sourceHexLocal(s)}99` }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* ── Cluster detail slide-in panel ──────────────────────── */}
      <ClusterPanel
        clusterId={selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

function sourceHexLocal(source: string): string {
  const map: Record<string, string> = {
    "BBC News": "#C8102E",
    "NPR":      "#3E86C1",
    "Reuters":  "#FF6900",
  };
  return map[source] ?? "#8A8D96";
}
