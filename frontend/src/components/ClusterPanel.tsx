"use client";

import { useEffect, useState } from "react";
import { api, ClusterDetail } from "@/lib/api";
import { SourceBadge } from "./SourceBadge";
import { formatDistanceToNow, format } from "date-fns";

interface Props {
  clusterId: string | null;
  onClose: () => void;
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="inline ml-1 opacity-50">
      <path d="M7 1h4v4M11 1L5.5 6.5M5 3H2a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function ClusterPanel({ clusterId, onClose }: Props) {
  const [data, setData]     = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!clusterId) { setData(null); return; }
    setLoading(true);
    setError(null);
    api.getCluster(clusterId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [clusterId]);

  if (!clusterId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-[#13151C] border-l border-border z-50 flex flex-col animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div className="flex-1 pr-4">
            {loading ? (
              <div className="h-6 w-48 bg-border rounded animate-pulse" />
            ) : (
              <h2 className="font-display font-bold text-lg text-paper leading-tight">
                {data?.cluster.label ?? "Loading…"}
              </h2>
            )}
            {data && (
              <p className="text-xs text-muted font-mono mt-2">
                {data.cluster.article_count} articles ·{" "}
                {data.cluster.earliest_at && formatDistanceToNow(new Date(data.cluster.earliest_at), { addSuffix: true })}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full border border-border text-muted hover:text-paper hover:border-signal transition-colors shrink-0"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading && (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border border-border p-4 space-y-2 animate-pulse">
                <div className="h-4 bg-border rounded w-3/4" />
                <div className="h-3 bg-border rounded w-1/3" />
                <div className="h-3 bg-border rounded w-full" />
                <div className="h-3 bg-border rounded w-5/6" />
              </div>
            ))
          )}

          {error && (
            <div className="rounded-xl border border-red-900/50 bg-red-900/10 p-4 text-red-400 text-sm font-mono">
              Failed to load: {error}
            </div>
          )}

          {data?.articles.map((article) => (
            <a
              key={article.id}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group block rounded-xl border border-border hover:border-signal/50 bg-white/[0.02] hover:bg-white/[0.04] p-4 transition-all duration-200 animate-fade-in"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <SourceBadge source={article.source} />
                <span className="text-[11px] text-muted font-mono shrink-0">
                  {article.published_at
                    ? format(new Date(article.published_at), "MMM d, HH:mm")
                    : "—"}
                </span>
              </div>

              <h3 className="text-sm font-display font-semibold text-paper group-hover:text-signal transition-colors leading-snug mb-2">
                {article.title}
                <ExternalLinkIcon />
              </h3>

              {article.summary && (
                <p className="text-xs text-muted leading-relaxed line-clamp-3">
                  {article.summary}
                </p>
              )}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
