"use client";

import { useState, useCallback } from "react";
import { api } from "@/lib/api";

interface Props {
  onDone: () => void;
}

type State = "idle" | "triggering" | "polling" | "done" | "error";

export default function RefreshButton({ onDone }: Props) {
  const [state, setState]   = useState<State>("idle");
  const [message, setMessage] = useState("");

  const handleRefresh = useCallback(async () => {
    setState("triggering");
    setMessage("Starting pipeline…");

    let jobId: string;
    try {
      const res = await api.triggerIngest();
      jobId = res.jobId;
    } catch (e: any) {
      setState("error");
      setMessage("Failed to start: " + e.message);
      setTimeout(() => setState("idle"), 4000);
      return;
    }

    setState("polling");
    setMessage("Scraping & clustering…");

    const poll = setInterval(async () => {
      try {
        const status = await api.getIngestStatus(jobId);
        if (status.status === "done") {
          clearInterval(poll);
          setState("done");
          setMessage("Timeline updated!");
          onDone();
          setTimeout(() => { setState("idle"); setMessage(""); }, 3000);
        } else if (status.status === "error") {
          clearInterval(poll);
          setState("error");
          setMessage("Pipeline error — check logs");
          setTimeout(() => { setState("idle"); setMessage(""); }, 5000);
        }
      } catch {
        // transient network error — keep polling
      }
    }, 2500);

    // Safety timeout after 3 min
    setTimeout(() => {
      clearInterval(poll);
      if (state === "polling") {
        setState("error");
        setMessage("Timeout — pipeline may still be running");
        setTimeout(() => { setState("idle"); setMessage(""); }, 4000);
      }
    }, 180_000);
  }, [onDone]);

  const busy = state === "triggering" || state === "polling";

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleRefresh}
        disabled={busy}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-display font-semibold text-sm
          border transition-all duration-200
          ${busy
            ? "bg-signal/20 border-signal/40 text-signal cursor-not-allowed"
            : state === "done"
            ? "bg-green-500/15 border-green-500/40 text-green-400"
            : state === "error"
            ? "bg-red-500/15 border-red-500/40 text-red-400"
            : "bg-signal text-ink border-signal hover:bg-signal/90 hover:scale-[1.02] active:scale-[0.98]"
          }
        `}
      >
        {busy ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40" strokeDashoffset="10" strokeLinecap="round"/>
            </svg>
            {state === "triggering" ? "Starting…" : "Updating…"}
          </>
        ) : state === "done" ? (
          <>✓ Updated</>
        ) : state === "error" ? (
          <>✕ Error</>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 7A6 6 0 0113 7M13 7l-2-2M13 7l-2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Refresh Data
          </>
        )}
      </button>

      {message && (
        <span className="text-xs font-mono text-muted animate-fade-in">
          {message}
        </span>
      )}
    </div>
  );
}
