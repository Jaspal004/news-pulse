"use client";

import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { TimelineCluster } from "@/lib/api";
import { format, fromUnixTime } from "date-fns";
import { sourceHex } from "./SourceBadge";

interface Props {
  clusters: TimelineCluster[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}

/** Map a 0–1 intensity to an opacity for the acid-yellow fill */
function intensityToOpacity(v: number) {
  return 0.25 + v * 0.75;
}

/** Pick the dominant source (first in sources array) for coloring */
function dominantSource(cluster: TimelineCluster): string {
  return cluster.sources?.[0] ?? "Unknown";
}

interface TooltipPayload {
  cx: number;
  cy: number;
  id: string;
  label: string;
  articleCount: number;
  start: number;
  end: number;
  sources: string[];
  intensity: number;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d: TooltipPayload = payload[0].payload;
  const duration = Math.round((d.end - d.start) / 60_000);
  return (
    <div className="bg-[#13151C] border border-border rounded-xl p-3 shadow-2xl max-w-[260px] animate-fade-in">
      <p className="font-display font-semibold text-sm text-paper leading-snug mb-2">{d.label}</p>
      <div className="space-y-1 text-[11px] font-mono text-muted">
        <div className="flex justify-between gap-4">
          <span>Articles</span>
          <span className="text-signal font-medium">{d.articleCount}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>First</span>
          <span className="text-paper">{format(d.start, "MMM d, HH:mm")}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Last</span>
          <span className="text-paper">{format(d.end, "MMM d, HH:mm")}</span>
        </div>
        {duration > 0 && (
          <div className="flex justify-between gap-4">
            <span>Span</span>
            <span className="text-paper">{duration < 60 ? `${duration}m` : `${Math.round(duration / 60)}h`}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span>Sources</span>
          <span className="text-paper">{d.sources.join(", ")}</span>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-signal/60 font-mono">Click to view articles →</p>
    </div>
  );
}

/** Custom scatter dot: renders a horizontal bar from start→end */
function ClusterBar(props: any) {
  const { cx, cy, payload, xAxis, onSelect, selectedId } = props;
  if (!payload || !xAxis) return null;

  const { id, start, end, intensity, sources, articleCount } = payload;

  const x1 = xAxis.scale(start);
  const x2 = xAxis.scale(end);
  const width = Math.max(x2 - x1, 6);  // minimum 6px for single-article clusters

  const isSelected = id === selectedId;
  const src = sources?.[0] ?? "Unknown";
  const color = sourceHex(src);
  const opacity = intensityToOpacity(intensity);

  const barH = Math.min(6 + articleCount * 2, 28);  // taller = more articles

  return (
    <g
      onClick={() => onSelect(id)}
      style={{ cursor: "pointer" }}
      className="group"
    >
      <rect
        x={x1}
        y={cy - barH / 2}
        width={width}
        height={barH}
        rx={barH / 2}
        fill={isSelected ? "#E8FF47" : color}
        fillOpacity={isSelected ? 1 : opacity}
        stroke={isSelected ? "#E8FF47" : "none"}
        strokeWidth={2}
        className="transition-all duration-200"
      />
      {/* Glow effect for selected */}
      {isSelected && (
        <rect
          x={x1 - 2}
          y={cy - barH / 2 - 2}
          width={width + 4}
          height={barH + 4}
          rx={barH / 2 + 2}
          fill="#E8FF47"
          fillOpacity={0.15}
        />
      )}
    </g>
  );
}

export default function TimelineChart({ clusters, onSelect, selectedId }: Props) {
  if (!clusters.length) {
    return (
      <div className="flex items-center justify-center h-[340px] text-muted font-mono text-sm">
        No clusters to display — try refreshing data.
      </div>
    );
  }

  // Sort by start time for Y-axis ordering (oldest at bottom)
  const sorted = [...clusters].sort((a, b) => a.start - b.start);

  // Assign Y index (0 = bottom)
  const data = sorted.map((c, i) => ({
    ...c,
    yIndex: i,
  }));

  const minTime = Math.min(...clusters.map((c) => c.start));
  const maxTime = Math.max(...clusters.map((c) => c.end));
  const pad     = (maxTime - minTime) * 0.04;

  return (
    <div className="w-full" style={{ height: Math.max(340, data.length * 36 + 60) }}>
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 20, right: 24, bottom: 20, left: 0 }}>
          <CartesianGrid
            strokeDasharray="1 4"
            stroke="#2A2D35"
            horizontal={false}
          />
          <XAxis
            type="number"
            dataKey="start"
            domain={[minTime - pad, maxTime + pad]}
            tickFormatter={(v) => format(v, "MMM d HH:mm")}
            tick={{ fill: "#8A8D96", fontSize: 11, fontFamily: "JetBrains Mono" }}
            tickLine={false}
            axisLine={{ stroke: "#2A2D35" }}
            scale="time"
          />
          <YAxis
            type="number"
            dataKey="yIndex"
            domain={[-1, data.length]}
            hide
          />
          <ZAxis range={[0, 0]} />   {/* suppress default circle sizing */}
          <Tooltip
            content={<CustomTooltip />}
            cursor={false}
          />
          <Scatter
            data={data}
            shape={(props: any) => (
              <ClusterBar
                {...props}
                onSelect={onSelect}
                selectedId={selectedId}
              />
            )}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
