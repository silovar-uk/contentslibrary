import { authenticate } from "./auth";
import { HttpError, assertSameOriginMutation, errorResponse, json, withSecurityHeaders } from "./http";
import type { AuthContext, Env } from "./types";
import { assertProgressMutation } from "./v02-validation";
import { addExperience, addNote, createWork, deleteWork, exportData, getWork, updateWork } from "./routes/works";
import { createSavedView, deleteSavedView, listLabelSuggestions, listSavedViews, listWorksV03, updateSavedView } from "./routes/library-v03";
import { deleteExperienceV04, deleteNoteV04, reorderNotesV04, updateExperienceV04, updateNoteV04 } from "./routes/content-v04";
import { blockUser, createInvitation, listAuditEvents, listSecurityEvents, listUsers, resolveSecurityEvent, revokeUserSession, suspendUser, unblockUser } from "./routes/admin";
import { getNotionImportStatus, importNotionSeed } from "./routes/notion-import";
import { getHomeV07 } from "./routes/home-v07";

function match(pathname: string, pattern: RegExp): RegExpMatchArray | null {
  return pathname.match(pattern);
}

async function handleApi(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  assertSameOriginMutation(request);
  const url = new URL(request.url);
  const path = url.pathname;
  await assertProgressMutation(request, env, auth);

  if (request.method === "GET" && path === "/api/me") {
    return json({
      user: {
        id: auth.member.id,
        email: auth.member.email,
        display_name: auth.member.display_name,
        role: auth.member.role,
        status: auth.member.status,
        is_dev: auth.isDev
      }
    });
  }
  if (request.method === "GET" && path === "/api/home") return getHomeV07(env, auth);
  if (request.method === "GET" && path === "/api/works") return listWorksV03(request, env, auth);
  if (request.method === "POST" && path === "/api/works") return createWork(request, env, auth);
  if (request.method === "GET" && path === "/api/export") return exportData(request, env, auth);
  if (request.method === "GET" && path === "/api/labels") return listLabelSuggestions(request, env, auth);
  if (request.method === "GET" && path === "/api/saved-views") return listSavedViews(env, auth);
  if (request.method === "POST" && path === "/api/saved-views") return createSavedView(request, env, auth);

  let m = match(path, /^\/api\/saved-views\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    if (request.method === "PATCH") return updateSavedView(request, env, auth, id);
    if (request.method === "DELETE") return deleteSavedView(env, auth, id);
  }

  m = match(path, /^\/api\/works\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    if (request.method === "GET") return getWork(env, auth, id);
    if (request.method === "PATCH") return updateWork(request, env, auth, id);
    if (request.method === "DELETE") return deleteWork(env, auth, id);
  }
  m = match(path, /^\/api\/works\/([^/]+)\/experiences$/);
  if (m && request.method === "POST") return addExperience(request, env, auth, decodeURIComponent(m[1]!));
  m = match(path, /^\/api\/works\/([^/]+)\/notes$/);
  if (m && request.method === "POST") return addNote(request, env, auth, decodeURIComponent(m[1]!));
  m = match(path, /^\/api\/works\/([^/]+)\/notes\/reorder$/);
  if (m && request.method === "POST") return reorderNotesV04(request, env, auth, decodeURIComponent(m[1]!));

  m = match(path, /^\/api\/notes\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    if (request.method === "PATCH") return updateNoteV04(request, env, auth, id);
    if (request.method === "DELETE") return deleteNoteV04(env, auth, id);
  }

  m = match(path, /^\/api\/experiences\/([^/]+)$/);
  if (m) {
    const id = decodeURIComponent(m[1]!);
    if (request.method === "PATCH") return updateExperienceV04(request, env, auth, id);
    if (request.method === "DELETE") return deleteExperienceV04(env, auth, id);
  }

  if (request.method === "GET" && path === "/api/admin/users") return listUsers(request, env, auth);
  if (request.method === "POST" && path === "/api/admin/invitations") return createInvitation(request, env, auth);
  if (request.method === "GET" && path === "/api/admin/security-events") return listSecurityEvents(request, env, auth);
  if (request.method === "GET" && path === "/api/admin/audit-events") return listAuditEvents(request, env, auth);
  if (request.method === "GET" && path === "/api/admin/notion-import") return getNotionImportStatus(env, auth);
  if (request.method === "POST" && path === "/api/admin/notion-import") return importNotionSeed(env, auth);

  m = match(path, /^\/api\/admin\/users\/([^/]+)\/(suspend|block|unblock|revoke)$/);
  if (m && request.method === "POST") {
    const id = decodeURIComponent(m[1]!);
    const action = m[2];
    if (action === "suspend") return suspendUser(request, env, auth, id);
    if (action === "block") return blockUser(request, env, auth, id);
    if (action === "unblock") return unblockUser(env, auth, id);
    if (action === "revoke") return revokeUserSession(env, auth, id);
  }
  m = match(path, /^\/api\/admin\/security-events\/([^/]+)\/resolve$/);
  if (m && request.method === "POST") return resolveSecurityEvent(request, env, auth, decodeURIComponent(m[1]!));

  throw new HttpError(404, "API_NOT_FOUND", "APIが見つかりません。");
}

function accessDeniedHtml(message: string, status: number): Response {
  const safe = message.replace(/[<>&"']/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch] || ch));
  const title = status === 503 ? "公開設定を確認してください" : "このページを利用できません";
  return withSecurityHeaders(new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{font-family:system-ui,sans-serif;background:#f5f3ee;color:#242522;margin:0;display:grid;place-items:center;min-height:100vh}.box{max-width:520px;padding:32px;background:#fff;border:1px solid #ddd7ca;border-radius:18px;box-shadow:0 18px 50px #0001}h1{font-size:24px}p{line-height:1.8;color:#60635c}</style><main class="box"><h1>${title}</h1><p>${safe}</p><p>${status === 503 ? "管理者がCloudflare Accessと本番環境変数を設定してください。" : "利用権限がある場合は、管理者へ確認してください。"}</p></main></html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8" } }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const auth = await authenticate(request, env);
      if (url.pathname === "/health") return json({ ok: true, service: "sakuhin-log", authenticated: true });
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, auth);
      const assetResponse = await env.ASSETS.fetch(request);
      return withSecurityHeaders(assetResponse);
    } catch (error) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/") && error instanceof HttpError && [401, 403, 503].includes(error.status)) {
        return accessDeniedHtml(error.message, error.status);
      }
      return errorResponse(error);
    }
  }
} satisfies ExportedHandler<Env>;
