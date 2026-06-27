"use client";

import { getSourceColor } from "./SourceBadge";

const SOURCES = ["BBC News", "NPR", "Reuters"];

interface Props {
  active: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function SourceFilter({ active, onChange }: Props) {
  function toggle(source: string) {
    const next = new Set(active);
    if (next.has(source)) {
      // Don't allow deselecting all
      if (next.size === 1) return;
      next.delete(source);
    } else {
      next.add(source);
    }
    onChange(next);
  }

  const allSelected = active.size === SOURCES.length;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] font-mono text-muted uppercase tracking-widest mr-1">Sources</span>

      {SOURCES.map((src) => {
        const on = active.has(src);
        const c  = getSourceColor(src);
        return (
          <button
            key={src}
            onClick={() => toggle(src)}
            className={`
              flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-medium
              border transition-all duration-150
              ${on
                ? `${c.bg} ${c.text} border-current`
                : "bg-transparent text-muted border-border hover:border-muted"
              }
            `}
          >
            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${on ? c.dot : "bg-muted"}`} />
            {src}
          </button>
        );
      })}

      {!allSelected && (
        <button
          onClick={() => onChange(new Set(SOURCES))}
          className="text-[11px] font-mono text-signal hover:underline ml-1"
        >
          All
        </button>
      )}
    </div>
  );
}
