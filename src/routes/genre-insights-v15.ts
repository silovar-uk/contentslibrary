import { GENRE_CATALOG_V15, resolveGenreV15 } from "../domain/genre-catalog-v15";
import { HttpError, json } from "../http";
import type { AuthContext, Env } from "../types";

const SCOPES = ["all", "unread", "active", "completed", "favorite"] as const;
type GenreScopeV15 = typeof SCOPES[number];

type GenreRowV15 = {
  id: string;
  rating: number | null;
  favorite: number | string | null;
  genre_name: string | null;
};

type GenreBucketV15 = {
  id: string;
  name: string;
  color: string;
  count: number;
  favoriteCount: number;
  ratingTotal: number;
  ratedCount: number;
};

const SCOPE_SQL: Record<GenreScopeV15, string> = {
  all: "",
  unread: "AND w.status IN ('want', 'owned_unread')",
  active: "AND w.status = 'active'",
  completed: "AND w.status = 'completed'",
  favorite: "AND COALESCE(json_extract(w.metadata_json, '$.favorite'), 0) = 1"
};

const SCOPE_LABELS: Record<GenreScopeV15, string> = {
  all: "すべて",
  unread: "未読・読みたい",
  active: "進行中",
  completed: "完了",
  favorite: "お気に入り"
};

function parseScopeV15(request: Request): GenreScopeV15 {
  const raw = new URL(request.url).searchParams.get("scope") || "all";
  if (!SCOPES.includes(raw as GenreScopeV15)) {
    throw new HttpError(400, "INVALID_GENRE_SCOPE", "ジャンル棚の対象が正しくありません。");
  }
  return raw as GenreScopeV15;
}

function roundShareV15(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function buildInsightsV15(input: {
  total: number;
  unclassified: number;
  genres: Array<{ name: string; share: number }>;
}): Array<{ type: string; text: string }> {
  const insights: Array<{ type: string; text: string }> = [];
  const largest = input.genres[0];
  if (largest) {
    insights.push({
      type: "largest_genre",
      text: `いちばん厚い棚は「${largest.name}」で、この棚の${Math.round(largest.share * 100)}％です。`
    });
  }
  if (input.total > 0 && input.unclassified / input.total >= 0.1) {
    insights.push({
      type: "unclassified",
      text: `${input.unclassified}作品は、まだジャンルが設定されていません。`
    });
  }
  return insights.slice(0, 2);
}

export async function getGenreInsightsV15(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  const scope = parseScopeV15(request);
  const rows = await env.DB.prepare(`
    WITH primary_genre AS (
      SELECT
        wl.work_id,
        l.name,
        ROW_NUMBER() OVER (
          PARTITION BY wl.work_id
          ORDER BY wl.position, l.normalized_name
        ) AS row_number
      FROM work_labels wl
      JOIN labels l ON l.id = wl.label_id
      WHERE l.kind = 'genre'
    )
    SELECT
      w.id,
      w.rating,
      COALESCE(json_extract(w.metadata_json, '$.favorite'), 0) AS favorite,
      pg.name AS genre_name
    FROM works w
    LEFT JOIN primary_genre pg
      ON pg.work_id = w.id
     AND pg.row_number = 1
    WHERE w.owner_id = ?
      AND w.deleted_at IS NULL
      ${SCOPE_SQL[scope]}
  `).bind(auth.member.id).all<GenreRowV15>();

  const buckets = new Map<string, GenreBucketV15>();
  const catalogOrder = new Map<string, number>(GENRE_CATALOG_V15.map((genre, index) => [genre.id, index]));
  const unmapped = new Map<string, number>();
  let unclassified = 0;

  for (const row of rows.results) {
    if (!row.genre_name) {
      unclassified += 1;
      continue;
    }
    const matched = resolveGenreV15(row.genre_name);
    const resolved = matched ?? GENRE_CATALOG_V15.find((genre) => genre.id === "other")!;
    if (!matched) unmapped.set(row.genre_name, (unmapped.get(row.genre_name) ?? 0) + 1);
    const bucket = buckets.get(resolved.id) ?? {
      id: resolved.id,
      name: resolved.name,
      color: resolved.color,
      count: 0,
      favoriteCount: 0,
      ratingTotal: 0,
      ratedCount: 0
    };
    bucket.count += 1;
    if (Number(row.favorite) === 1) bucket.favoriteCount += 1;
    if (row.rating !== null && Number.isFinite(Number(row.rating))) {
      bucket.ratingTotal += Number(row.rating);
      bucket.ratedCount += 1;
    }
    buckets.set(bucket.id, bucket);
  }

  const total = rows.results.length;
  const genres = Array.from(buckets.values())
    .map((bucket) => ({
      id: bucket.id,
      name: bucket.name,
      color: bucket.color,
      count: bucket.count,
      share: total > 0 ? roundShareV15(bucket.count / total) : 0,
      favorite_count: bucket.favoriteCount,
      average_rating: bucket.ratedCount > 0 ? Math.round((bucket.ratingTotal / bucket.ratedCount) * 10) / 10 : null
    }))
    .sort((a, b) => b.count - a.count || (catalogOrder.get(a.id) ?? 999) - (catalogOrder.get(b.id) ?? 999));

  return json({
    scope,
    scope_label: SCOPE_LABELS[scope],
    total,
    classified: total - unclassified,
    unclassified,
    genres,
    insights: buildInsightsV15({ total, unclassified, genres }),
    diagnostics: {
      unmapped_labels: Array.from(unmapped, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"))
    }
  });
}
