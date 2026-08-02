import { $, esc, toast, fmtDateTime } from "../core/dom.js";
import { api } from "../core/api.js";
import { state } from "../core/store.js";
import { openDangerDialog } from "./dialogs.js";

export function renderAccount() {
  $("#accountInfo").innerHTML = `<dt>メール</dt><dd>${esc(state.me.email)}</dd><dt>権限</dt><dd>${esc(state.me.role)}</dd><dt>状態</dt><dd>${esc(state.me.status)}</dd><dt>認証</dt><dd>${state.me.is_dev ? "ローカル開発用" : "Cloudflare Access"}</dd>`;
}

async function exportFile(format) {
  // 共通api()はJSON形式のレスポンスをオブジェクトへ変換してしまうため、
  // ファイル取得(blob化)には生のfetch/Responseを使う。
  try {
    const response = await fetch(`/api/export?format=${encodeURIComponent(format)}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: format === "json" ? "application/json" : "*/*" }
    });
    if (!response.ok) {
      const contentType = response.headers.get("content-type") || "";
      const message = contentType.includes("application/json") ? (await response.json().catch(() => ({})))?.error?.message : await response.text().catch(() => "");
      throw new Error(message || `エラー ${response.status}`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sakuhin-log-${new Date().toISOString().slice(0, 10)}.${format === "markdown" ? "md" : format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`${format.toUpperCase()}を書き出しました。`);
  } catch (e) { toast(e.message, "error"); }
}

export async function loadAdmin() {
  if (!["owner", "admin"].includes(state.me.role)) return;
  try {
    const [users, security] = await Promise.all([api("/api/admin/users"), api("/api/admin/security-events?status=open")]);
    state.admin.users = users.items;
    state.admin.security = security.items;
    renderAdmin();
  } catch (e) { toast(e.message, "error"); }
}

function renderAdmin() {
  $("#userTable").innerHTML = `<table class="admin-table"><thead><tr><th>ユーザー</th><th>権限</th><th>状態</th><th>最終ログイン</th><th>操作</th></tr></thead><tbody>${state.admin.users.map((u) => `<tr><td><strong>${esc(u.display_name || u.email)}</strong><br><span class="muted">${esc(u.email)}</span></td><td>${esc(u.role)}</td><td>${esc(u.status)}${u.suspended_until ? `<br><small>${fmtDateTime(u.suspended_until)}まで</small>` : ""}</td><td>${fmtDateTime(u.last_login_at) || "—"}</td><td><div class="user-actions">${u.role === "owner" ? '<span class="muted">保護対象</span>' : u.status === "blocked" || u.status === "suspended" ? `<button data-admin-action="unblock" data-user-id="${u.id}" data-email="${esc(u.email)}">解除</button>` : `<button data-admin-action="suspend" data-user-id="${u.id}" data-email="${esc(u.email)}">一時停止</button><button class="danger-link" data-admin-action="block" data-user-id="${u.id}" data-email="${esc(u.email)}">ブロック</button><button data-admin-action="revoke" data-user-id="${u.id}" data-email="${esc(u.email)}">セッション失効</button>`}</div></td></tr>`).join("")}</tbody></table>`;
  $("#securityEvents").innerHTML = state.admin.security.length
    ? state.admin.security.map((e) => `<article class="security-event"><span class="risk ${esc(e.risk)}">${esc(e.risk)}</span><div><strong>${esc(e.event_type)}</strong><p>${esc(e.email || "未登録ユーザー")} / ${esc(e.country || "国不明")} / ${esc(e.ip_mask || "IP不明")}</p><small>${fmtDateTime(e.created_at)}</small></div><button class="ghost-button" data-security-resolve="${e.id}">確認済み</button></article>`).join("")
    : '<div class="empty-state">未確認イベントはありません。</div>';
}

async function revokeUser(id) {
  if (!confirm("このユーザーを全端末からログアウトさせますか？")) return;
  try { await api(`/api/admin/users/${encodeURIComponent(id)}/revoke`, { method: "POST", body: "{}" }); toast("セッションを失効しました。"); await loadAdmin(); }
  catch (e) { toast(e.message, "error"); }
}

async function submitDanger(form) {
  const action = form.action.value;
  const id = form.user_id.value;
  const payload = { reason: form.reason.value };
  if (action === "block") payload.email_confirm = form.email_confirm.value;
  if (action === "suspend") payload.suspended_until = form.suspended_until.value ? new Date(form.suspended_until.value).toISOString() : null;
  try {
    const result = await api(`/api/admin/users/${encodeURIComponent(id)}/${action}`, { method: "POST", body: JSON.stringify(payload) });
    $("#dangerDialog").close();
    toast(result.session_revoke?.attempted === false ? "アプリ内の利用を停止しました。Cloudflareセッション失効は未設定です。" : "操作を完了しました。");
    await loadAdmin();
  } catch (e) { $(".form-error", form).textContent = e.message; }
}

export function initAdmin() {
  $("#dangerForm").addEventListener("submit", (e) => { e.preventDefault(); submitDanger(e.currentTarget); });
  $("#inviteForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try { await api("/api/admin/invitations", { method: "POST", body: JSON.stringify({ email: f.email.value, role: f.role.value }) }); f.reset(); toast("招待を作成しました。"); await loadAdmin(); }
    catch (err) { toast(err.message, "error"); }
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-action='refresh-admin']")) loadAdmin();
    const exportFormat = event.target.closest("[data-export]")?.dataset.export;
    if (exportFormat) void exportFile(exportFormat);
    const adminAction = event.target.closest("[data-admin-action]");
    if (adminAction) {
      const { adminAction: act, userId, email } = adminAction.dataset;
      if (act === "revoke") void revokeUser(userId);
      else openDangerDialog(act, userId, email);
    }
    const resolve = event.target.closest("[data-security-resolve]")?.dataset.securityResolve;
    if (resolve) {
      try { await api(`/api/admin/security-events/${encodeURIComponent(resolve)}/resolve`, { method: "POST", body: JSON.stringify({ status: "resolved" }) }); toast("確認済みにしました。"); await loadAdmin(); }
      catch (err) { toast(err.message, "error"); }
    }
  });
}
