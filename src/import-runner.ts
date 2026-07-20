import { errorResponse, json } from "./http";
import type { AuthContext, Env, Member } from "./types";
import {
  commitImportBatch,
  createImportBatch,
  enableImportCenter,
  getImportBatchDetail,
  rollbackImportBatch,
  uploadImportItems,
  validateImportBatch
} from "./routes/import-center";

interface ImportEnv extends Env {
  IMPORT_TOKEN?: string;
}

function authorized(request: Request, env: ImportEnv): boolean {
  const token = env.IMPORT_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  return Boolean(token && header === `Bearer ${token}`);
}

async function ownerAuth(env: ImportEnv): Promise<AuthContext> {
  const member = await env.DB.prepare(
    "SELECT * FROM members WHERE role = 'owner' AND status = 'active' ORDER BY created_at LIMIT 1"
  ).first<Member>();
  if (!member) throw new Error("Active owner was not found.");
  return { member, claims: { import_runner: true }, isDev: false };
}

async function verifyBatch(env: ImportEnv, auth: AuthContext, batchId: string): Promise<Response> {
  const batch = await env.DB.prepare(
    "SELECT id, status, expected_works, expected_notes, staged_works, staged_notes, insert_count, merge_count, skip_count, conflict_count, applied_works, applied_notes FROM import_batches WHERE id = ? AND owner_id = ? LIMIT 1"
  ).bind(batchId, auth.member.id).first<Record<string, unknown>>();
  if (!batch) return json({ ok: false, error: "batch_not_found" }, 404);

  const missingWorks = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM import_items i LEFT JOIN works w ON w.id = i.applied_work_id AND w.deleted_at IS NULL WHERE i.batch_id = ? AND i.action = 'applied' AND w.id IS NULL"
  ).bind(batchId).first<{ count: number }>();
  const missingNotes = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM import_notes i LEFT JOIN notes n ON n.id = i.applied_note_id WHERE i.batch_id = ? AND i.action = 'applied' AND n.id IS NULL"
  ).bind(batchId).first<{ count: number }>();
  const duplicateSources = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM (SELECT source_key FROM works WHERE owner_id = ? AND deleted_at IS NULL AND source_key IS NOT NULL GROUP BY source_key HAVING COUNT(*) > 1)"
  ).bind(auth.member.id).first<{ count: number }>();
  const unresolvedChanges = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM import_applied_changes WHERE batch_id = ? AND reversed_at IS NOT NULL"
  ).bind(batchId).first<{ count: number }>();
  const foreignKeys = await env.DB.prepare("PRAGMA foreign_key_check").all<Record<string, unknown>>();

  const checks = {
    missing_applied_works: Number(missingWorks?.count ?? 0),
    missing_applied_notes: Number(missingNotes?.count ?? 0),
    duplicate_active_source_keys: Number(duplicateSources?.count ?? 0),
    reversed_changes: Number(unresolvedChanges?.count ?? 0),
    foreign_key_errors: foreignKeys.results.length
  };
  const expectedTotal = Number(batch.insert_count ?? 0) + Number(batch.merge_count ?? 0) + Number(batch.skip_count ?? 0);
  const ok = batch.status === "committed"
    && Number(batch.expected_works ?? 0) === Number(batch.staged_works ?? 0)
    && Number(batch.expected_notes ?? 0) === Number(batch.staged_notes ?? 0)
    && Number(batch.expected_works ?? 0) === expectedTotal
    && Number(batch.conflict_count ?? 0) === 0
    && Object.values(checks).every((value) => value === 0);
  return json({ ok, batch, checks }, ok ? 200 : 409);
}

export default {
  async fetch(request: Request, env: ImportEnv): Promise<Response> {
    try {
      if (!authorized(request, env)) return json({ error: "unauthorized" }, 401);
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      const auth = await ownerAuth(env);

      if (request.method === "GET" && path === "/health") {
        return json({ ok: true, owner_id: auth.member.id });
      }
      if (request.method === "POST" && path === "/enable") {
        return enableImportCenter(request, env, auth);
      }
      if (request.method === "POST" && path === "/batches") {
        return createImportBatch(request, env, auth);
      }

      const match = path.match(/^\/batches\/([^/]+)(?:\/(items|validate|commit|rollback|verify))?$/);
      if (match) {
        const batchId = decodeURIComponent(match[1]!);
        const action = match[2] ?? "detail";
        if (request.method === "GET" && action === "detail") return getImportBatchDetail(env, auth, batchId);
        if (request.method === "GET" && action === "verify") return verifyBatch(env, auth, batchId);
        if (request.method === "POST" && action === "items") return uploadImportItems(request, env, auth, batchId);
        if (request.method === "POST" && action === "validate") return validateImportBatch(env, auth, batchId);
        if (request.method === "POST" && action === "commit") return commitImportBatch(env, auth, batchId);
        if (request.method === "POST" && action === "rollback") return rollbackImportBatch(env, auth, batchId);
      }
      return json({ error: "not_found" }, 404);
    } catch (error) {
      return errorResponse(error);
    }
  }
};
