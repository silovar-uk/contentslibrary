import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { HttpError } from "./http";
import { audit, getMemberByIdentity, maskIp, newId, normalizeEmail, normalizeText, nowIso, securityEvent } from "./db";
import { assertRuntimeConfiguration, isLocalRequest } from "./production-safety";
import type { AuthContext, Env, Member } from "./types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function requestMeta(request: Request) {
  return {
    country: request.headers.get("cf-ipcountry"),
    ipMask: maskIp(request.headers.get("cf-connecting-ip")),
    userAgent: (request.headers.get("user-agent") || "").slice(0, 240)
  };
}

async function verifyAccessJwt(request: Request, env: Env): Promise<JWTPayload> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new HttpError(401, "AUTH_REQUIRED", "ログインが必要です。");
  if (!env.TEAM_DOMAIN || !env.POLICY_AUD || env.POLICY_AUD.startsWith("replace-")) {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "認証設定が完了していません。");
  }
  const issuer = env.TEAM_DOMAIN.replace(/\/$/, "");
  let jwks = jwksCache.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksCache.set(issuer, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: env.POLICY_AUD });
    return payload;
  } catch (error) {
    console.warn("Access JWT verification failed", error instanceof Error ? error.message : error);
    throw new HttpError(401, "AUTH_INVALID", "ログイン状態を確認できませんでした。再度ログインしてください。");
  }
}

async function bootstrapOwner(env: Env, subject: string, email: string): Promise<Member | null> {
  const allowed = env.ALLOW_OWNER_BOOTSTRAP === "true";
  const ownerEmail = env.OWNER_EMAIL ? normalizeEmail(env.OWNER_EMAIL) : "";
  if (!allowed || !ownerEmail || email !== ownerEmail) return null;
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM members WHERE role = 'owner' AND status <> 'removed'").first<{ count: number }>();
  if ((count?.count ?? 0) > 0) return null;
  const id = newId();
  const now = nowIso();
  await env.DB.prepare(
    "INSERT INTO members (id, access_subject, email, display_name, role, status, created_at, activated_at, last_login_at, updated_at) VALUES (?, ?, ?, ?, 'owner', 'active', ?, ?, ?, ?)"
  ).bind(id, subject, email, "Owner", now, now, now, now).run();
  await audit(env, "OWNER_BOOTSTRAPPED", id, id, { after: { email, role: "owner", status: "active" } });
  if (env.SEED_DEMO_DATA === "true") await seedDemoData(env, id);
  return await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(id).first<Member>();
}

async function activateInvitation(env: Env, subject: string, email: string): Promise<Member | null> {
  const invitation = await env.DB.prepare(
    "SELECT * FROM invitations WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1"
  ).bind(email, nowIso()).first<{ id: string; role: string }>();
  if (!invitation) return null;
  const member = await env.DB.prepare("SELECT * FROM members WHERE email = ? AND status = 'invited' LIMIT 1").bind(email).first<Member>();
  if (!member) return null;
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE members SET access_subject = ?, role = ?, status = 'active', activated_at = ?, last_login_at = ?, updated_at = ? WHERE id = ?")
      .bind(subject, invitation.role, now, now, now, member.id),
    env.DB.prepare("UPDATE invitations SET used_at = ? WHERE id = ? AND used_at IS NULL").bind(now, invitation.id),
    env.DB.prepare("INSERT INTO audit_events (id, actor_id, target_id, action, after_json, created_at) VALUES (?, ?, ?, 'USER_ACTIVATED', ?, ?)")
      .bind(newId(), member.id, member.id, JSON.stringify({ email, role: invitation.role }), now)
  ]);
  return await env.DB.prepare("SELECT * FROM members WHERE id = ?").bind(member.id).first<Member>();
}

async function autoResumeIfDue(env: Env, member: Member): Promise<Member> {
  if (member.status !== "suspended" || !member.suspended_until) return member;
  if (new Date(member.suspended_until).getTime() > Date.now()) return member;
  const now = nowIso();
  await env.DB.prepare("UPDATE members SET status = 'active', suspended_until = NULL, updated_at = ? WHERE id = ? AND status = 'suspended'")
    .bind(now, member.id).run();
  await audit(env, "USER_AUTO_RESUMED", member.id, member.id, { before: { status: "suspended" }, after: { status: "active" } });
  return { ...member, status: "active", suspended_until: null, updated_at: now };
}

async function seedDemoData(env: Env, ownerId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT COUNT(*) AS count FROM works WHERE owner_id = ?").bind(ownerId).first<{ count: number }>();
  if ((existing?.count ?? 0) > 0) return;
  const now = nowIso();
  const samples = [
    {
      type: "book", title: "暇と退屈の倫理学", creator: "國分功一郎", status: "completed", rating: 4.5,
      short: "暇を埋めることと、退屈から逃げることは同じではない。", labels: ["哲学", "社会", "退屈", "消費", "再読したい"]
    },
    {
      type: "book", title: "恐れのない組織", creator: "エイミー・C・エドモンドソン", status: "active", rating: null,
      short: "心理的安全性を、優しさではなく学習の条件として捉える。", labels: ["ビジネス", "組織", "仕事"]
    },
    {
      type: "movie", title: "パラサイト 半地下の家族", creator: "ポン・ジュノ", status: "completed", rating: 4.0,
      short: "階段と高低差が、階級そのものとして画面に残る。", labels: ["社会", "家族", "格差"]
    },
    {
      type: "manga", title: "チ。―地球の運動について―", creator: "魚豊", status: "completed", rating: 5.0,
      short: "知識は誰か一人の所有物ではなく、命を越えて運ばれる。", labels: ["歴史", "信念", "知識"]
    }
  ];
  for (const sample of samples) {
    const workId = newId();
    const search = normalizeText([sample.title, sample.creator, sample.short, ...sample.labels].join(" "));
    await env.DB.prepare(
      "INSERT INTO works (id, owner_id, type, title, creator, status, rating, short_note, search_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(workId, ownerId, sample.type, sample.title, sample.creator, sample.status, sample.rating, sample.short, search, now, now).run();
    for (const [index, labelName] of sample.labels.entries()) {
      const kind = index === 0 ? "genre" : index < 3 ? "theme" : "tag";
      const normalized = normalizeText(labelName);
      await env.DB.prepare(
        "INSERT INTO labels (id, owner_id, kind, name, normalized_name, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, kind, normalized_name) DO NOTHING"
      ).bind(newId(), ownerId, kind, labelName, normalized, now).run();
      await env.DB.prepare(
        "INSERT OR IGNORE INTO work_labels (work_id, label_id) SELECT ?, id FROM labels WHERE owner_id = ? AND kind = ? AND normalized_name = ?"
      ).bind(workId, ownerId, kind, normalized).run();
    }
    if (sample.status === "completed") {
      const expId = newId();
      await env.DB.prepare(
        "INSERT INTO experiences (id, work_id, sequence, started_at, completed_at, rating, memo, created_at, updated_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)"
      ).bind(expId, workId, now.slice(0, 10), now.slice(0, 10), sample.rating, sample.short, now, now).run();
      await env.DB.prepare(
        "INSERT INTO notes (id, work_id, experience_id, note_type, content, created_at, updated_at) VALUES (?, ?, ?, 'impression', ?, ?, ?)"
      ).bind(newId(), workId, expId, sample.short, now, now).run();
    }
  }
}

export async function authenticate(request: Request, env: Env): Promise<AuthContext> {
  assertRuntimeConfiguration(request, env);
  const localDev = isLocalRequest(request) && env.DEV_AUTH_ENABLED === "true";
  let claims: JWTPayload;
  if (localDev) {
    claims = {
      sub: request.headers.get("x-dev-sub") || env.DEV_AUTH_SUB || "dev-owner",
      email: request.headers.get("x-dev-email") || env.DEV_AUTH_EMAIL || env.OWNER_EMAIL || "owner@example.com",
      name: "Local Development User"
    };
  } else {
    claims = await verifyAccessJwt(request, env);
  }

  const subject = typeof claims.sub === "string" ? claims.sub : "";
  const emailClaim = typeof claims.email === "string" ? claims.email : "";
  const email = normalizeEmail(emailClaim);
  if (!subject || !email) throw new HttpError(401, "AUTH_IDENTITY_INCOMPLETE", "ログイン情報を確認できませんでした。");

  let member = await getMemberByIdentity(env, subject, email);
  if (!member) member = await bootstrapOwner(env, subject, email);
  if (!member || member.status === "invited") member = await activateInvitation(env, subject, email);

  const meta = requestMeta(request);
  if (!member) {
    await securityEvent(env, {
      eventType: "UNINVITED_ACCESS",
      risk: "high",
      result: "denied",
      country: meta.country,
      ipMask: meta.ipMask,
      metadata: { email, userAgent: meta.userAgent }
    });
    throw new HttpError(403, "ACCESS_DENIED", "このページを利用できません。");
  }

  member = await autoResumeIfDue(env, member);
  if (member.status !== "active") {
    await securityEvent(env, {
      userId: member.id,
      eventType: `${member.status.toUpperCase()}_USER_ACCESS`,
      risk: member.status === "blocked" ? "critical" : "high",
      result: "denied",
      country: meta.country,
      ipMask: meta.ipMask,
      metadata: { userAgent: meta.userAgent }
    });
    throw new HttpError(403, "ACCESS_DENIED", "このページを利用できません。");
  }

  if (member.access_subject !== subject || member.email !== email) {
    await env.DB.prepare("UPDATE members SET access_subject = ?, email = ?, updated_at = ? WHERE id = ?")
      .bind(subject, email, nowIso(), member.id).run();
    member = { ...member, access_subject: subject, email };
  }

  const lastLogin = member.last_login_at ? new Date(member.last_login_at).getTime() : 0;
  if (Date.now() - lastLogin > 15 * 60 * 1000) {
    const now = nowIso();
    await env.DB.prepare("UPDATE members SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(now, now, member.id).run();
    member = { ...member, last_login_at: now, updated_at: now };
  }

  return { member, claims: claims as Record<string, unknown>, isDev: localDev };
}
