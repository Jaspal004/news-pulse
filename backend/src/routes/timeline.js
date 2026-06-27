const express = require("express");
const router  = express.Router();
const db      = require("../db");

/**
 * GET /timeline
 * Returns clusters shaped for charting:
 *   id, label, start (ms), end (ms), articleCount, intensity (0–1), sources[]
 *
 * Optional query params:
 *   ?source=BBC+News   — filter to clusters containing articles from that source
 *   ?limit=50          — cap number of clusters returned (default 50)
 */
router.get("/", async (req, res, next) => {
  try {
    const { source } = req.query;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);

    let baseQuery = `
      SELECT
        c.id,
        c.label,
        c.article_count,
        c.earliest_at,
        c.latest_at,
        ARRAY_AGG(DISTINCT a.source) FILTER (WHERE a.source IS NOT NULL) AS sources
      FROM clusters c
      LEFT JOIN articles a ON a.cluster_id = c.id
    `;
    const params = [];

    if (source) {
      params.push(source);
      baseQuery += ` WHERE a.source = $${params.length}`;
    }

    baseQuery += `
      GROUP BY c.id
      HAVING c.earliest_at IS NOT NULL
      ORDER BY c.latest_at DESC NULLS LAST
      LIMIT $${params.length + 1}
    `;
    params.push(limit);

    const { rows } = await db.query(baseQuery, params);

    if (rows.length === 0) {
      return res.json({ clusters: [], maxArticleCount: 0, updatedAt: new Date().toISOString() });
    }

    const maxCount = Math.max(...rows.map((r) => r.article_count));

    const clusters = rows.map((r) => ({
      id:           r.id,
      label:        r.label,
      start:        new Date(r.earliest_at).getTime(),  // epoch ms for recharts
      end:          new Date(r.latest_at).getTime(),
      articleCount: r.article_count,
      intensity:    maxCount > 0 ? r.article_count / maxCount : 0,
      sources:      r.sources || [],
    }));

    res.json({
      clusters,
      maxArticleCount: maxCount,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
