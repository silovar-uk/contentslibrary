import type { Env, LabelKind, Member } from "./types";

export const nowIso = (): string => new Date().toISOString();
export const newId = (): string => crypto.randomUUID();

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function getMemberByIdentity(env: Env, subject: string, email: string): Promise<Member | null> {
  const normalized = normalizeEmail(email);
  const bySubject = await env.DB.prepare("SELECT * FROM members WHERE access_subject = ? LIMIT 1").bind(subject).first<Member>();
  if (bySubject) return bySubject;
  return await env.DB.prepare("SELECT * FROM members WHERE email = ? LIMIT 1").bind(normalized).first<Member>();
}

export async function audit(
  env: Env,
  action: string,
  actorId: string | null,
  targetId: string | null,
  options: { before?: unknown; after?: unknown; reason?: string | null } = {}
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO audit_events (id, actor_id, target_id, action, before_json, after_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      newId(),
      actorId,
      targetId,
      action,
      options.before === undefined ? null : JSON.stringify(options.before),
      options.after === undefined ? null : JSON.stringify(options.after),
      options.reason ?? null,
      nowIso()
    )
    .run();
}

export async function securityEvent(
  env: Env,
  input: {
    userId?: string | null;
    eventType: string;
    risk: "critical" | "high" | "medium" | "info";
    result?: string | null;
    country?: string | null;
    ipMask?: string | null;
    metadata?: unknown;
  }
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO security_events (id, user_id, event_type, risk, result, country, ip_mask, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  )
    .bind(
      newId(),
      input.userId ?? null,
      input.eventType,
      input.risk,
      input.result ?? null,
      input.country ?? null,
      input.ipMask ?? null,
      JSON.stringify(input.metadata ?? {}),
      nowIso()
    )
    .run();
}

export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes(":")) {
    const parts = ip.split(":");
    return `${parts.slice(0, 3).join(":")}:****`;
  }
  const parts = ip.split(".");
  if (parts.length !== 4) return "***";
  return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
}

export async function syncLabels(
  env: Env,
  ownerId: string,
  workId: string,
  labels: Partial<Record<LabelKind, string[]>>
): Promise<void> {
  const statements: D1PreparedStatement[] = [env.DB.prepare("DELETE FROM work_labels WHERE work_id = ?").bind(workId)];
  for (const kind of ["genre", "theme", "tag"] as LabelKind[]) {
    const values = Array.from(new Set((labels[kind] ?? []).map((v) => v.trim()).filter(Boolean))).slice(0, 30);
    for (const name of values) {
      const normalized = normalizeText(name).slice(0, 80);
      const id = newId();
      statements.push(
        env.DB.prepare(
          "INSERT INTO labels (id, owner_id, kind, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, kind, normalized_name) DO UPDATE SET name = excluded.name"
        ).bind(id, ownerId, kind, name.slice(0, 40), normalized, nowIso())
      );
      statements.push(
        env.DB.prepare(
          "INSERT OR IGNORE INTO work_labels (work_id, label_id) SELECT ?, id FROM labels WHERE owner_id = ? AND kind = ? AND normalized_name = ?"
        ).bind(workId, ownerId, kind, normalized)
      );
    }
  }
  await env.DB.batch(statements);
}

export async function rebuildWorkSearchText(env: Env, workId: string, ownerId: string): Promise<void> {
  const work = await env.DB.prepare("SELECT title, creator, short_note FROM works WHERE id = ? AND owner_id = ?").bind(workId, ownerId).first<{
    title: string;
    creator: string | null;
    short_note: string | null;
  }>();
  if (!work) return;
  const labels = await env.DB.prepare(
    "SELECT l.name FROM labels l JOIN work_labels wl ON wl.label_id = l.id WHERE wl.work_id = ? ORDER BY l.kind, l.name"
  ).bind(workId).all<{ name: string }>();
  const notes = await env.DB.prepare("SELECT content FROM notes WHERE work_id = ? ORDER BY updated_at DESC LIMIT 100").bind(workId).all<{ content: string }>();
  const text = [work.title, work.creator ?? "", work.short_note ?? "", ...labels.results.map((x) => x.name), ...notes.results.map((x) => x.content)].join(" ");
  await env.DB.prepare("UPDATE works SET search_text = ? WHERE id = ? AND owner_id = ?").bind(normalizeText(text), workId, ownerId).run();
}

export async function getLabelsForWorks(env: Env, workIds: string[]): Promise<Map<string, { genre: string[]; theme: string[]; tag: string[] }>> {
  const map = new Map<string, { genre: string[]; theme: string[]; tag: string[] }>();
  if (workIds.length === 0) return map;
  const placeholders = workIds.map(() => "?").join(",");
  const rows = await env.DB.prepare(
    `SELECT wl.work_id, l.kind, l.name FROM work_labels wl JOIN labels l ON l.id = wl.label_id WHERE wl.work_id IN (${placeholders}) ORDER BY l.name`
  ).bind(...workIds).all<{ work_id: string; kind: LabelKind; name: string }>();
  for (const row of rows.results) {
    const current = map.get(row.work_id) ?? { genre: [], theme: [], tag: [] };
    current[row.kind].push(row.name);
    map.set(row.work_id, current);
  }
  return map;
}
