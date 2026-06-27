"use client";

const SOURCE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "BBC News": { bg: "bg-[#C8102E]/15", text: "text-[#ff5c73]",  dot: "bg-[#C8102E]" },
  "NPR":      { bg: "bg-[#3E86C1]/15", text: "text-[#7ec0ff]",  dot: "bg-[#3E86C1]" },
  "Reuters":  { bg: "bg-[#FF6900]/15", text: "text-[#ffaa60]",  dot: "bg-[#FF6900]" },
};

const DEFAULT_COLOR = { bg: "bg-white/10", text: "text-white/50", dot: "bg-white/40" };

export function getSourceColor(source: string) {
  return SOURCE_COLORS[source] ?? DEFAULT_COLOR;
}

export function SourceBadge({ source }: { source: string }) {
  const c = getSourceColor(source);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {source}
    </span>
  );
}

/** Returns a CSS hex color for use in recharts */
export function sourceHex(source: string): string {
  const map: Record<string, string> = {
    "BBC News": "#C8102E",
    "NPR":      "#3E86C1",
    "Reuters":  "#FF6900",
  };
  return map[source] ?? "#8A8D96";
}
