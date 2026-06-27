"""
News Pulse — RSS Ingestion & TF-IDF Topic Clustering
Pulls articles from 3 RSS feeds, extracts full body, clusters by topic, writes to Postgres.
"""

import os
import sys
import uuid
import logging
from datetime import datetime, timezone
from urllib.parse import urlparse

import feedparser
import trafilatura
import psycopg2
from psycopg2.extras import execute_values
from dateutil import parser as dateutil_parser
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

# ─── Config ───────────────────────────────────────────────────────────────────

DATABASE_URL = os.environ.get("DATABASE_URL")

RSS_FEEDS = [
    {
        "name": "BBC News",
        "url": "http://feeds.bbci.co.uk/news/rss.xml",
    },
    {
        "name": "NPR",
        "url": "https://feeds.npr.org/1001/rss.xml",
    },
    {
        "name": "Reuters",
        "url": "https://feeds.reuters.com/reuters/topNews",
    },
]

SIMILARITY_THRESHOLD = 0.30   # cosine similarity cutoff to be in same cluster
MIN_CLUSTER_SIZE     = 2      # singleton articles get their own cluster label
MAX_FEATURES         = 1000   # TF-IDF vocabulary size

# ─── Database ─────────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(DATABASE_URL)


def ensure_schema(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS clusters (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                label        TEXT NOT NULL,
                article_count INT DEFAULT 0,
                earliest_at  TIMESTAMPTZ,
                latest_at    TIMESTAMPTZ,
                created_at   TIMESTAMPTZ DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS articles (
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
        """)
    conn.commit()
    log.info("Schema verified.")


# ─── RSS Ingestion ─────────────────────────────────────────────────────────────

def parse_date(raw) -> datetime:
    """Try multiple strategies to parse a publish date; fall back to now."""
    if not raw:
        return datetime.now(timezone.utc)
    try:
        return dateutil_parser.parse(raw).astimezone(timezone.utc)
    except Exception:
        return datetime.now(timezone.utc)


def extract_body(url: str) -> str:
    """Fetch and extract main article body. Returns empty string on failure."""
    try:
        downloaded = trafilatura.fetch_url(url)
        if downloaded:
            text = trafilatura.extract(downloaded, include_comments=False, include_tables=False)
            return text or ""
    except Exception as e:
        log.debug(f"Body extraction failed for {url}: {e}")
    return ""


def ingest_feed(feed_cfg: dict) -> list[dict]:
    """Parse one RSS feed and return normalized article dicts."""
    log.info(f"Fetching: {feed_cfg['name']} ({feed_cfg['url']})")
    articles = []
    try:
        feed = feedparser.parse(feed_cfg["url"])
    except Exception as e:
        log.warning(f"Failed to fetch feed {feed_cfg['name']}: {e}")
        return articles

    for entry in feed.entries:
        # Normalize URL
        url = entry.get("link") or entry.get("id", "")
        if not url or not urlparse(url).scheme:
            continue

        # Normalize title
        title = entry.get("title", "").strip()

        # Normalize summary: prefer content:encoded, then summary, then description
        summary = ""
        if hasattr(entry, "content") and entry.content:
            summary = entry.content[0].get("value", "")
        if not summary:
            summary = entry.get("summary", entry.get("description", ""))
        # Strip any HTML tags from summary simply
        import re
        summary = re.sub(r"<[^>]+>", " ", summary).strip()
        summary = re.sub(r"\s+", " ", summary)

        # Normalize date
        raw_date = (
            entry.get("published")
            or entry.get("updated")
            or entry.get("dc_date")
            or ""
        )
        published_at = parse_date(raw_date)

        articles.append({
            "url":          url,
            "title":        title,
            "summary":      summary[:1000],
            "source":       feed_cfg["name"],
            "published_at": published_at,
        })

    log.info(f"  → {len(articles)} articles from {feed_cfg['name']}")
    return articles


def fetch_bodies(articles: list[dict]) -> list[dict]:
    """Enrich articles with full body text (best-effort)."""
    log.info("Extracting article bodies...")
    for i, art in enumerate(articles):
        art["body"] = extract_body(art["url"])
        if (i + 1) % 10 == 0:
            log.info(f"  Extracted {i+1}/{len(articles)}")
    return articles


# ─── Deduplication ─────────────────────────────────────────────────────────────

def filter_new_articles(conn, articles: list[dict]) -> list[dict]:
    """Remove articles whose URL is already stored."""
    if not articles:
        return []
    urls = [a["url"] for a in articles]
    with conn.cursor() as cur:
        cur.execute("SELECT url FROM articles WHERE url = ANY(%s)", (urls,))
        existing = {row[0] for row in cur.fetchall()}
    new = [a for a in articles if a["url"] not in existing]
    log.info(f"New articles after dedup: {len(new)} / {len(articles)}")
    return new


# ─── TF-IDF Clustering ─────────────────────────────────────────────────────────

def make_text(art: dict) -> str:
    """Combine title + summary + first 300 chars of body for TF-IDF."""
    parts = [
        art.get("title", "") * 3,   # weight title more
        art.get("summary", ""),
        (art.get("body", "") or "")[:300],
    ]
    return " ".join(filter(None, parts))


def cluster_articles(articles: list[dict]) -> list[dict]:
    """
    Approach: TF-IDF vectorization + cosine similarity + greedy threshold clustering.

    Why greedy threshold over KMeans/DBSCAN:
    - We don't know k in advance (news volume varies daily).
    - DBSCAN requires careful epsilon tuning.
    - Greedy merge on cosine similarity ≥ SIMILARITY_THRESHOLD is simple,
      interpretable, and works well on short news text.

    Threshold chosen at 0.30 after manual inspection of ~50 article pairs:
    - 0.30 catches "same story, different outlets" reliably.
    - Below 0.20 merges unrelated topics that share domain vocabulary (e.g.
      two separate "election" stories in different countries).

    Known limitation: TF-IDF is bag-of-words, so it misses semantic similarity.
    "Gaza truce" and "Gaza ceasefire" may end up in different clusters.
    A sentence-transformer embedding would fix this, but adds GPU/latency cost.
    """
    if not articles:
        return []

    texts = [make_text(a) for a in articles]

    vectorizer = TfidfVectorizer(
        stop_words="english",
        max_features=MAX_FEATURES,
        ngram_range=(1, 2),
        min_df=1,
    )

    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
    except ValueError:
        # All texts empty after stop-word removal (very small input)
        for i, art in enumerate(articles):
            art["cluster_id_local"] = i
        return articles

    tfidf_norm = normalize(tfidf_matrix, norm="l2")
    sim = cosine_similarity(tfidf_norm)

    n = len(articles)
    cluster_assignment = [-1] * n
    cluster_id = 0

    for i in range(n):
        if cluster_assignment[i] != -1:
            continue
        cluster_assignment[i] = cluster_id
        for j in range(i + 1, n):
            if cluster_assignment[j] == -1 and sim[i][j] >= SIMILARITY_THRESHOLD:
                cluster_assignment[j] = cluster_id
        cluster_id += 1

    for i, art in enumerate(articles):
        art["cluster_id_local"] = cluster_assignment[i]

    log.info(f"Formed {cluster_id} clusters from {n} articles (threshold={SIMILARITY_THRESHOLD})")
    return articles


def generate_cluster_label(articles_in_cluster: list[dict], vectorizer_terms=None) -> str:
    """Generate a human-readable label using top TF-IDF terms from cluster text."""
    if len(articles_in_cluster) == 1:
        title = articles_in_cluster[0].get("title", "Article")
        return title[:60] + ("…" if len(title) > 60 else "")

    combined = " ".join(make_text(a) for a in articles_in_cluster)
    try:
        vec = TfidfVectorizer(stop_words="english", max_features=200, ngram_range=(1, 2))
        mat = vec.fit_transform([combined])
        scores = mat.toarray()[0]
        terms = vec.get_feature_names_out()
        top_idx = scores.argsort()[::-1][:4]
        top_terms = [terms[i] for i in top_idx if scores[i] > 0]
        if top_terms:
            return " · ".join(t.title() for t in top_terms[:3])
    except Exception:
        pass
    return "Mixed Topic Cluster"


# ─── Database Write ────────────────────────────────────────────────────────────

def save_clusters_and_articles(conn, articles: list[dict]):
    """
    Group articles by cluster_id_local, upsert clusters, then insert articles.
    """
    from collections import defaultdict
    groups = defaultdict(list)
    for art in articles:
        groups[art["cluster_id_local"]].append(art)

    with conn.cursor() as cur:
        for local_id, group in groups.items():
            label = generate_cluster_label(group)
            times = [a["published_at"] for a in group]
            earliest = min(times)
            latest   = max(times)
            count    = len(group)

            cluster_uuid = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO clusters (id, label, article_count, earliest_at, latest_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (cluster_uuid, label, count, earliest, latest))
            cluster_db_id = cur.fetchone()[0]

            rows = [
                (
                    str(uuid.uuid4()),
                    a["url"],
                    a.get("title", ""),
                    a.get("summary", ""),
                    a.get("body", ""),
                    a.get("source", ""),
                    a.get("published_at"),
                    cluster_db_id,
                )
                for a in group
            ]
            execute_values(cur, """
                INSERT INTO articles (id, url, title, summary, body, source, published_at, cluster_id)
                VALUES %s
                ON CONFLICT (url) DO NOTHING
            """, rows)

    conn.commit()
    log.info(f"Saved {len(groups)} clusters and {len(articles)} articles.")


# ─── Entry Point ───────────────────────────────────────────────────────────────

def run():
    if not DATABASE_URL:
        log.error("DATABASE_URL environment variable not set.")
        sys.exit(1)

    conn = get_conn()
    ensure_schema(conn)

    # 1. Ingest all feeds
    all_articles = []
    for feed in RSS_FEEDS:
        all_articles.extend(ingest_feed(feed))

    # 2. Filter already-stored articles
    new_articles = filter_new_articles(conn, all_articles)

    if not new_articles:
        log.info("No new articles to process. Exiting.")
        conn.close()
        return

    # 3. Extract bodies (best-effort)
    new_articles = fetch_bodies(new_articles)

    # 4. Cluster
    new_articles = cluster_articles(new_articles)

    # 5. Save
    save_clusters_and_articles(conn, new_articles)

    conn.close()
    log.info("Pipeline complete.")


if __name__ == "__main__":
    run()
