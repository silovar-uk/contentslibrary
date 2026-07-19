import { audit, newId, normalizeText, nowIso, syncLabels } from "../db";
import { HttpError, json } from "../http";
import { NOTION_DATABASE_URL, NOTION_SEED_ITEMS } from "../notion-seed";
import type { AuthContext, Env, LabelKind } from "../types";

function requireImportAdmin(auth: AuthContext): void {
  if (!["owner", "admin"].includes(auth.member.role)) {
    throw new HttpError(403, "FORBIDDEN", "Notion取り込みはownerまたはadminのみ実行できます。");
  }
}

function itemLabels(item: (typeof NOTION_SEED_ITEMS)[number]): Partial<Record<LabelKind, string[]>> {
  return {
    genre: item.genres ?? [],
    theme: [],
    tag: ["Notion移行", item.hallOfFame ? "殿堂入り" : "", item.wantsToBorrow ? "借りたい" : ""].filter(Boolean)
  };
}

export async function getNotionImportStatus(env: Env, auth: AuthContext): Promise<Response> {
  requireImportAdmin(auth);
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM works WHERE owner_id = ? AND source_key LIKE 'notion:%' AND deleted_at IS NULL"
  ).bind(auth.member.id).first<{ count: number }>();

  return json({
    source: "notion",
    database_url: NOTION_DATABASE_URL,
    available: NOTION_SEED_ITEMS.length,
    imported: Number(row?.count ?? 0),
    remaining: Math.max(0, NOTION_SEED_ITEMS.length - Number(row?.count ?? 0))
  });
}

export async function importNotionSeed(env: Env, auth: AuthContext): Promise<Response> {
  requireImportAdmin(auth);
  let inserted = 0;
  let skipped = 0;
  const imported: Array<{ id: string; title: string }> = [];

  for (const item of NOTION_SEED_ITEMS) {
    const id = newId();
    const labels = itemLabels(item);
    const labelText = Object.values(labels).flat().join(" ");
    const metadata = {
      source: "notion",
      source_key: item.sourceKey,
      notion_database_url: NOTION_DATABASE_URL,
      notion_page_url: item.notionUrl,
      source_url: item.sourceUrl ?? null,
      original_title: item.rawTitle,
      notion_created_at: item.createdAt,
      notion_updated_at: item.updatedAt,
      notion_hall_of_fame: Boolean(item.hallOfFame),
      notion_wants_to_borrow: Boolean(item.wantsToBorrow),
      imported_at: nowIso()
    };
    const searchText = normalizeText([item.title, item.creator ?? "", item.trigger ?? "", labelText, item.rawTitle].join(" "));
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO works (id, owner_id, type, title, creator, status, short_note, visibility, metadata_json, search_text, source_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'want', ?, 'private', ?, ?, ?, ?, ?)"
    ).bind(
      id,
      auth.member.id,
      item.type,
      item.title,
      item.creator ?? null,
      item.trigger ?? null,
      JSON.stringify(metadata),
      searchText,
      item.sourceKey,
      item.createdAt,
      item.updatedAt
    ).run();

    if ((result.meta.changes ?? 0) === 0) {
      skipped += 1;
      continue;
    }

    inserted += 1;
    imported.push({ id, title: item.title });
    await syncLabels(env, auth.member.id, id, labels);
  }

  await audit(env, "NOTION_IMPORT_COMPLETED", auth.member.id, null, {
    after: { inserted, skipped, total: NOTION_SEED_ITEMS.length, database_url: NOTION_DATABASE_URL }
  });

  return json({
    ok: true,
    inserted,
    skipped,
    total: NOTION_SEED_ITEMS.length,
    imported
  });
}
