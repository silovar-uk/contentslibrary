import { audit, newId, normalizeEmail, nowIso } from "../db";
import { HttpError, json, parseJson } from "../http";
import type { AuthContext, Env, Member, Role } from "../types";

function requireAdmin(auth: AuthContext): void {
  if (!["owner", "admin"].includes(auth.member.role)) throw new HttpError(403, "FORBIDDEN", "管理権限がありません。");
}

async function getTarget(env: Env, id: string): Promise<Member> {
  const target = await env.DB.prepare("SELECT * FROM members WHERE id = ? LIMIT 1").bind(id).first<Member>();
  if (!target) throw new HttpError(404, "NOT_FOUND", "対象ユーザーが見つかりません。");
  return target;
}

function assertCanManage(auth: AuthContext, target: Member): void {
  if (target.id === auth.member.id) throw new HttpError(403, "SELF_PROTECTED", "自分自身にはこの操作を実行できません。");
  if (target.role === "owner") throw new HttpError(403, "OWNER_PROTECTED", "ownerにはこの操作を実行できません。");
  if (auth.member.role === "admin" && target.role === "admin") throw new HttpError(403, "PEER_PROTECTED", "同じ権限の管理者にはこの操作を実行できません。");
}

async function revokeAccessSession(env: Env, email: string): Promise<{ attempted: boolean; success: boolean; message?: string }> {
  if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID) return { attempted: false, success: false, message: "Cloudflare API設定なし" };
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/access/organizations/revoke_user`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, devices: true })
  });
  if (!response.ok) {
    const body = await response.text();
    console.warn("Cloudflare session revoke failed", response.status, body.slice(0, 500));
    return { attempted: true, success: false, message: `Cloudflare API ${response.status}` };
  }
  return { attempted: true, success: true };
}

export async function listUsers(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireAdmin(auth);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (status && ["invited", "active", "suspended", "blocked", "removed"].includes(status)) {
    clauses.push("status = ?"); params.push(status);
  }
  const sql = `SELECT id, email, display_name, role, status, suspended_until, blocked_at, created_at, activated_at, last_login_at, updated_at FROM members ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END, created_at DESC`;
  const rows = await env.DB.prepare(sql).bind(...params).all();
  return json({ items: rows.results });
}

export async function createInvitation(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireAdmin(auth);
  const payload = await parseJson<Record<string, unknown>>(request);
  if (typeof payload.email !== "string") throw new HttpError(422, "VALIDATION_ERROR", "メールアドレスを入力してください。", { field: "email" });
  const email = normalizeEmail(payload.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(422, "VALIDATION_ERROR", "メールアドレスが正しくありません。", { field: "email" });
  const role = (typeof payload.role === "string" ? payload.role : "member") as Role;
  const allowedRoles: Role[] = auth.member.role === "owner" ? ["admin", "member", "viewer"] : ["member", "viewer"];
  if (!allowedRoles.includes(role)) throw new HttpError(403, "ROLE_NOT_ALLOWED", "その権限では招待できません。");
  const days = Math.min(30, Math.max(1, Number(payload.expires_in_days ?? 7) || 7));
  const existingMember = await env.DB.prepare("SELECT * FROM members WHERE email = ? LIMIT 1").bind(email).first<Member>();
  if (existingMember && existingMember.status !== "removed") throw new HttpError(409, "USER_EXISTS", "このメールアドレスはすでに登録されています。");
  const existingInvite = await env.DB.prepare("SELECT id, expires_at FROM invitations WHERE email = ? AND used_at IS NULL AND expires_at > ? LIMIT 1")
    .bind(email, nowIso()).first<{ id: string; expires_at: string }>();
  if (existingInvite) throw new HttpError(409, "INVITATION_EXISTS", "有効な招待がすでにあります。", { expires_at: existingInvite.expires_at });
  const now = nowIso();
  const expires = new Date(Date.now() + days * 86400000).toISOString();
  const invitationId = newId();
  const memberId = existingMember?.id ?? newId();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("INSERT INTO invitations (id, email, role, expires_at, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(invitationId, email, role, expires, auth.member.id, now)
  ];
  if (existingMember) {
    statements.push(env.DB.prepare("UPDATE members SET role = ?, status = 'invited', access_subject = NULL, updated_at = ? WHERE id = ?").bind(role, now, memberId));
  } else {
    statements.push(env.DB.prepare("INSERT INTO members (id, email, role, status, created_at, updated_at) VALUES (?, ?, ?, 'invited', ?, ?)").bind(memberId, email, role, now, now));
  }
  await env.DB.batch(statements);
  await audit(env, "USER_INVITED", auth.member.id, memberId, { after: { email, role, expires_at: expires } });
  return json({ id: invitationId, member_id: memberId, email, role, expires_at: expires }, 201);
}

export async function suspendUser(request: Request, env: Env, auth: AuthContext, targetId: string): Promise<Response> {
  requireAdmin(auth);
  const target = await getTarget(env, targetId);
  assertCanManage(auth, target);
  const payload = await parseJson<Record<string, unknown>>(request);
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (reason.length < 10 || reason.length > 500) throw new HttpError(422, "VALIDATION_ERROR", "理由は10〜500文字で入力してください。", { field: "reason" });
  const untilValue = typeof payload.suspended_until === "string" ? payload.suspended_until : "";
  const until = untilValue ? new Date(untilValue).toISOString() : new Date(Date.now() + 7 * 86400000).toISOString();
  if (new Date(until).getTime() <= Date.now()) throw new HttpError(422, "VALIDATION_ERROR", "停止期限は未来の日時を指定してください。", { field: "suspended_until" });
  const now = nowIso();
  await env.DB.prepare("UPDATE members SET status = 'suspended', suspended_until = ?, updated_at = ? WHERE id = ?").bind(until, now, target.id).run();
  await audit(env, "USER_SUSPENDED", auth.member.id, target.id, { before: { status: target.status }, after: { status: "suspended", suspended_until: until }, reason });
  const revoke = await revokeAccessSession(env, target.email);
  return json({ ok: true, status: "suspended", suspended_until: until, session_revoke: revoke });
}

export async function blockUser(request: Request, env: Env, auth: AuthContext, targetId: string): Promise<Response> {
  requireAdmin(auth);
  const target = await getTarget(env, targetId);
  assertCanManage(auth, target);
  const payload = await parseJson<Record<string, unknown>>(request);
  const emailConfirm = typeof payload.email_confirm === "string" ? normalizeEmail(payload.email_confirm) : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (emailConfirm !== target.email) throw new HttpError(422, "VALIDATION_ERROR", "確認用メールアドレスが一致しません。", { field: "email_confirm" });
  if (reason.length < 10 || reason.length > 500) throw new HttpError(422, "VALIDATION_ERROR", "理由は10〜500文字で入力してください。", { field: "reason" });
  const now = nowIso();
  await env.DB.prepare("UPDATE members SET status = 'blocked', suspended_until = NULL, blocked_at = ?, blocked_by = ?, blocked_reason = ?, updated_at = ? WHERE id = ?")
    .bind(now, auth.member.id, reason, now, target.id).run();
  await audit(env, "USER_BLOCKED", auth.member.id, target.id, { before: { status: target.status }, after: { status: "blocked" }, reason });
  const revoke = await revokeAccessSession(env, target.email);
  if (revoke.attempted && !revoke.success) {
    await audit(env, "SESSION_REVOKE_FAILED", auth.member.id, target.id, { reason: revoke.message ?? "unknown" });
  } else if (revoke.success) {
    await audit(env, "SESSION_REVOKED", auth.member.id, target.id, { reason: "block" });
  }
  return json({ ok: true, status: "blocked", session_revoke: revoke });
}

export async function unblockUser(request: Request, env: Env, auth: AuthContext, targetId: string): Promise<Response> {
  requireAdmin(auth);
  const target = await getTarget(env, targetId);
  assertCanManage(auth, target);
  if (target.status !== "blocked" && target.status !== "suspended") throw new HttpError(409, "INVALID_STATE", "解除できる状態ではありません。");
  const payload = await parseJson<Record<string, unknown>>(request);
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (reason.length < 5 || reason.length > 500) throw new HttpError(422, "VALIDATION_ERROR", "解除理由は5〜500文字で入力してください。", { field: "reason" });
  const now = nowIso();
  await env.DB.prepare("UPDATE members SET status = 'active', suspended_until = NULL, blocked_at = NULL, blocked_by = NULL, blocked_reason = NULL, updated_at = ? WHERE id = ?")
    .bind(now, target.id).run();
  await audit(env, "USER_UNBLOCKED", auth.member.id, target.id, { before: { status: target.status }, after: { status: "active" }, reason });
  return json({ ok: true, status: "active" });
}

export async function revokeUserSession(env: Env, auth: AuthContext, targetId: string): Promise<Response> {
  requireAdmin(auth);
  const target = await getTarget(env, targetId);
  assertCanManage(auth, target);
  const revoke = await revokeAccessSession(env, target.email);
  if (!revoke.attempted) throw new HttpError(501, "SESSION_REVOKE_NOT_CONFIGURED", "Cloudflare API設定がないため、管理画面からのセッション失効は利用できません。");
  if (!revoke.success) throw new HttpError(502, "SESSION_REVOKE_FAILED", "Cloudflare側のセッション失効に失敗しました。");
  await audit(env, "SESSION_REVOKED", auth.member.id, target.id, { reason: "manual" });
  return json({ ok: true });
}

export async function listSecurityEvents(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireAdmin(auth);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "open";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
  const rows = await env.DB.prepare(
    "SELECT s.*, m.email, m.display_name FROM security_events s LEFT JOIN members m ON m.id = s.user_id WHERE (? = 'all' OR s.resolved_status = ?) ORDER BY CASE s.risk WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, s.created_at DESC LIMIT ?"
  ).bind(status, status, limit).all<Record<string, unknown>>();
  return json({ items: rows.results.map((row) => ({ ...row, metadata: parseJsonSafe(String(row.metadata_json || "{}"), {}), metadata_json: undefined })) });
}

export async function resolveSecurityEvent(request: Request, env: Env, auth: AuthContext, eventId: string): Promise<Response> {
  requireAdmin(auth);
  const payload = await parseJson<Record<string, unknown>>(request);
  const status = typeof payload.status === "string" ? payload.status : "resolved";
  if (!["confirmed", "false_positive", "resolved"].includes(status)) throw new HttpError(422, "VALIDATION_ERROR", "確認状態が正しくありません。", { field: "status" });
  const now = nowIso();
  const result = await env.DB.prepare("UPDATE security_events SET resolved_status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?")
    .bind(status, now, auth.member.id, eventId).run();
  if ((result.meta.changes ?? 0) === 0) throw new HttpError(404, "NOT_FOUND", "イベントが見つかりません。");
  await audit(env, "SECURITY_EVENT_RESOLVED", auth.member.id, eventId, { after: { status } });
  return json({ ok: true, status });
}

export async function listAuditEvents(request: Request, env: Env, auth: AuthContext): Promise<Response> {
  requireAdmin(auth);
  const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 50)));
  const rows = await env.DB.prepare(
    "SELECT a.*, actor.email AS actor_email, target.email AS target_email FROM audit_events a LEFT JOIN members actor ON actor.id = a.actor_id LEFT JOIN members target ON target.id = a.target_id ORDER BY a.created_at DESC LIMIT ?"
  ).bind(limit).all<Record<string, unknown>>();
  return json({ items: rows.results });
}

function parseJsonSafe<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}
