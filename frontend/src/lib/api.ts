const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export interface ClusterSummary {
  id:           string;
  label:        string;
  article_count: number;
  earliest_at:  string;
  latest_at:    string;
  sources:      string[];
}

export interface Article {
  id:           string;
  title:        string;
  url:          string;
  summary:      string;
  source:       string;
  published_at: string;
}

export interface ClusterDetail {
  cluster:  ClusterSummary;
  articles: Article[];
}

export interface TimelineCluster {
  id:           string;
  label:        string;
  start:        number;  // epoch ms
  end:          number;
  articleCount: number;
  intensity:    number;  // 0–1
  sources:      string[];
}

export interface TimelineResponse {
  clusters:        TimelineCluster[];
  maxArticleCount: number;
  updatedAt:       string;
}

export interface IngestJob {
  jobId:      string;
  status:     "running" | "done" | "error";
  startedAt:  string;
  finishedAt: string | null;
  logs:       string[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getClusters: (source?: string) =>
    apiFetch<{ clusters: ClusterSummary[] }>(
      `/clusters${source ? `?source=${encodeURIComponent(source)}` : ""}`
    ),

  getCluster: (id: string) =>
    apiFetch<ClusterDetail>(`/clusters/${id}`),

  getTimeline: (source?: string) =>
    apiFetch<TimelineResponse>(
      `/timeline${source ? `?source=${encodeURIComponent(source)}` : ""}`
    ),

  triggerIngest: () =>
    apiFetch<{ jobId: string }>("/ingest/trigger", { method: "POST" }),

  getIngestStatus: (jobId: string) =>
    apiFetch<IngestJob>(`/ingest/status/${jobId}`),
};
