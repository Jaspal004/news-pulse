const express = require("express");
const router  = express.Router();
const db      = require("../db");

/**
 * GET /clusters
 * Returns list of all clusters with summary info, newest first.
 */
router.get("/", async (req, res, next) => {
  try {
    const { source } = req.query;   // optional ?source=BBC+News

    let query = `
      SELECT
        c.id,
        c.label,
        c.article_count,
        c.earliest_at,
        c.latest_at,
        c.created_at,
        ARRAY_AGG(DISTINCT a.source) AS sources
      FROM clusters c
      LEFT JOIN articles a ON a.cluster_id = c.id
    `;
    const params = [];

    if (source) {
      params.push(source);
      query += ` WHERE a.source = $${params.length}`;
    }

    query += `
      GROUP BY c.id
      ORDER BY c.latest_at DESC NULLS LAST
      LIMIT 100
    `;

    const { rows } = await db.query(query, params);
    res.json({ clusters: rows });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /clusters/:id
 * Returns full cluster detail + all articles sorted chronologically.
 */
router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validate UUID format
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "Invalid cluster ID format" });
    }

    const clusterRes = await db.query(
      "SELECT * FROM clusters WHERE id = $1",
      [id]
    );
    if (clusterRes.rows.length === 0) {
      return res.status(404).json({ error: "Cluster not found" });
    }

    const articlesRes = await db.query(
      `SELECT id, title, url, summary, source, published_at
       FROM articles
       WHERE cluster_id = $1
       ORDER BY published_at ASC`,
      [id]
    );

    res.json({
      cluster:  clusterRes.rows[0],
      articles: articlesRes.rows,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
