# News Pulse — Topic-Clustered News Timeline

A live system that ingests articles from three RSS feeds, groups related articles into topic clusters using TF-IDF + cosine similarity, and displays them as an interactive timeline.

---

## Live URLs

| Component | URL |
|-----------|-----|
| Frontend  | `https://news-pulse-chi-ruddy.vercel.app`  |
| Backend API | `https://news-pulse-api.onrender.com` |

---

## Architecture Overview

```
┌───────────────────┐     writes      ┌────────────────┐
│  Python Scraper   │ ─────────────► │  Supabase      │
│  (GitHub Actions  │                 │  (Postgres)    │
│   cron / on-demand│                 └───────┬────────┘
└───────────────────┘                         │ reads
                                              ▼
                                    ┌─────────────────┐
                                    │  Node.js API    │
                                    │  (Render)       │
                                    └────────┬────────┘
                                             │ REST
                                             ▼
                                    ┌─────────────────┐
                                    │  Next.js UI     │
                                    │  (Vercel)       │
                                    └─────────────────┘
```

**Data flow:**
1. GitHub Actions triggers `scraper/main.py` every hour (or on-demand via the UI's Refresh button, which calls `POST /ingest/trigger` → Node spawns Python as a subprocess).
2. The scraper fetches articles, extracts bodies, clusters them, and writes to Supabase Postgres.
3. The Node API reads from Supabase and serves five REST endpoints to the frontend.
4. The Next.js frontend shows a recharts-based timeline; clicking a cluster opens a detail panel.

---

## News Sources

| Source | Feed URL |
|--------|----------|
| BBC News | `http://feeds.bbci.co.uk/news/rss.xml` |
| NPR | `https://feeds.npr.org/1001/rss.xml` |
| Reuters | `https://feeds.reuters.com/reuters/topNews` |

---

## Topic Grouping Approach

**Method: TF-IDF + Cosine Similarity (Option B)**

**Why TF-IDF over keyword overlap:**
Keyword overlap requires manually curating stop-word lists and overlap thresholds, and misses synonyms entirely (two articles about the same story will both use "ceasefire" and "Gaza", but one might say "truce" where the other says "peace deal"). TF-IDF naturally down-weights common words and up-weights distinctive ones, and cosine similarity handles vocabulary variation better than raw word counts.

**Implementation:**
```
title (×3 weight) + summary + first 300 chars of body
    → TfidfVectorizer(stop_words='english', max_features=1000, ngram_range=(1,2))
    → normalize(L2)
    → cosine_similarity matrix (n×n)
    → greedy threshold clustering: for each ungrouped article i,
      assign all j where sim[i][j] ≥ 0.30 to the same cluster
```

**Why greedy threshold, not KMeans or DBSCAN:**
- We don't know the number of topics (k) in advance — it varies daily.
- DBSCAN's epsilon requires careful per-run tuning.
- Greedy merge is simple, deterministic, and interpretable.

**Threshold selection (0.30):**
Manually inspected ~50 article pairs across runs:
- sim ≥ 0.40: too strict — same story, different outlets often separated.
- sim ≥ 0.20: too loose — "US election" and "UK election" merged.
- sim = 0.30: clean separation in practice.

**Cluster label generation:**
Run TF-IDF again on the concatenated text of the cluster's articles; take the top 3 bigrams/unigrams by score and join them: e.g. `"Gaza Ceasefire · Hamas Talks · Middle East"`.

**Known limitation:**
TF-IDF is bag-of-words — it misses semantic similarity. "Gaza truce" and "Gaza ceasefire" may end up in different clusters if the articles don't share enough vocabulary. A sentence-transformer embedding (e.g. `all-MiniLM-L6-v2`) would fix this, but adds latency and GPU requirements outside a free-tier deploy.

---

## Running Locally

### Prerequisites
- Python 3.11+
- Node.js 18+
- A Supabase project (free) with the connection string

### 1. Database

In your Supabase SQL editor, run:

```sql
CREATE TABLE clusters (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  article_count INT DEFAULT 0,
  earliest_at  TIMESTAMPTZ,
  latest_at    TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE articles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url          TEXT UNIQUE NOT NULL,
  title        TEXT,
  summary      TEXT,
  body         TEXT,
  source       TEXT,
  published_at TIMESTAMPTZ,
  cluster_id   UUID REFERENCES clusters(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
```

The scraper also runs `CREATE TABLE IF NOT EXISTS` on startup, so this is optional.

### 2. Scraper

```bash
cd scraper
pip install -r requirements.txt
export DATABASE_URL="postgresql://..."
python main.py
```

### 3. Backend

```bash
cd backend
npm install
cp .env.example .env
# Fill in DATABASE_URL and other vars
npm run dev
```

API is at `http://localhost:4000`.

### 4. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:4000
npm run dev
```

App is at `http://localhost:3000`.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/clusters` | All clusters (label, count, time range). Optional `?source=BBC+News` |
| `GET` | `/clusters/:id` | Full cluster detail + articles sorted by time |
| `GET` | `/timeline` | Clusters shaped for charting (start/end epoch ms, intensity). Optional `?source=` |
| `POST` | `/ingest/trigger` | Trigger Python scraper; returns `{ jobId }` |
| `GET` | `/ingest/status/:jobId` | Poll job status: `running \| done \| error` |
| `GET` | `/health` | Health check |

---

## Deployment

### Supabase (Database)
1. Create a new project at supabase.com.
2. Copy the connection string from Settings → Database → Connection string (URI mode).
3. Add it as `DATABASE_URL` in both Render (backend) and GitHub Actions secrets.

### Render (Backend)
1. New Web Service → connect GitHub repo → set Root Directory to `backend`.
2. Build command: `npm install`; Start command: `node src/index.js`.
3. Add env vars: `DATABASE_URL`, `FRONTEND_URL`, `PYTHON_BIN=python3`, `NODE_ENV=production`.

### Vercel (Frontend)
1. Import GitHub repo → set Root Directory to `frontend`.
2. Add env var: `NEXT_PUBLIC_API_URL=https://your-api.onrender.com`.
3. Deploy — Vercel auto-detects Next.js.

### GitHub Actions (Scraper cron)
1. Add `DATABASE_URL` as a repository secret (Settings → Secrets → Actions).
2. The workflow at `.github/workflows/scraper.yml` runs hourly automatically.
3. It can also be triggered manually from the Actions tab, or via the UI's Refresh button (which spawns a subprocess on the Render server).

---

## Project Structure

```
news-pulse/
├── .github/workflows/
│   └── scraper.yml         # Hourly cron for Python scraper
├── scraper/
│   ├── main.py             # RSS ingestion + TF-IDF clustering
│   └── requirements.txt
├── backend/
│   ├── src/
│   │   ├── index.js        # Express app entry point
│   │   ├── db.js           # Postgres connection pool
│   │   └── routes/
│   │       ├── clusters.js # GET /clusters, GET /clusters/:id
│   │       ├── timeline.js # GET /timeline
│   │       └── ingest.js   # POST /ingest/trigger, GET /ingest/status/:id
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx    # Main page with timeline + cluster list
    │   │   └── globals.css
    │   ├── components/
    │   │   ├── TimelineChart.tsx  # recharts scatter timeline
    │   │   ├── ClusterPanel.tsx   # slide-in article detail
    │   │   ├── SourceFilter.tsx   # source toggle pills
    │   │   ├── RefreshButton.tsx  # trigger + poll ingest
    │   │   └── SourceBadge.tsx    # colored source chip
    │   └── lib/
    │       └── api.ts       # typed fetch helpers
    ├── .env.local.example
    └── package.json
```

---

## Assumptions & Notes

- **Duplicate detection** uses URL uniqueness (`ON CONFLICT (url) DO NOTHING`). Cross-outlet deduplication of the same story is a stretch goal not implemented.
- **Body extraction** is best-effort via `trafilatura`. Sites with paywalls or aggressive bot-blocking return an empty body; the scraper continues with headline + summary only.
- **RSS date parsing** uses `dateutil.parser.parse()` with a UTC fallback — handles the dozen+ date formats seen across feeds.
- **In-memory job store** in the Node API is sufficient for this assessment; a production system would use Redis or a `jobs` DB table.
- **Free-tier cold starts**: Render free instances sleep after inactivity. The first request after a cold start may take 30–60 seconds.
