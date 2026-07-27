import { errorResponse, json } from "./http";
import type { AuthContext, Env, Member } from "./types";
import {
  commitImportBatch,
  createImportBatch,
  enableImportCenter,
  getImportBatchDetail,
  rollbackImportBatch,
  uploadImportItems,
  validateImportBatch,
  verifyImportBatch
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
        return createImportBatch(request, env, auth, "ci");
      }

      const match = path.match(/^\/batches\/([^/]+)(?:\/(items|validate|commit|rollback|verify))?$/);
      if (match) {
        const batchId = decodeURIComponent(match[1]!);
        const action = match[2] ?? "detail";
        if (request.method === "GET" && action === "detail") return getImportBatchDetail(env, auth, batchId);
        if (request.method === "GET" && action === "verify") return verifyImportBatch(env, auth, batchId);
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
