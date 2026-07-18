import { HttpError } from "./http";
import type { Env } from "./types";

export function isLocalRequest(request: Request): boolean {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
}

function isConfiguredHttpsUrl(value: string | undefined): boolean {
  if (!value || value.includes("your-team") || value.includes("replace-")) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function isConfiguredAudience(value: string | undefined): boolean {
  return Boolean(value && value.length >= 12 && !value.startsWith("replace-") && !value.includes("YOUR_"));
}

export function assertRuntimeConfiguration(request: Request, env: Env): void {
  if (isLocalRequest(request)) return;

  if (env.APP_ENV !== "production") {
    throw new HttpError(503, "UNSAFE_REMOTE_CONFIGURATION", "本番環境の設定が完了していません。");
  }
  if (env.DEV_AUTH_ENABLED === "true") {
    throw new HttpError(503, "DEV_AUTH_EXPOSED", "開発用ログインが有効なため公開を停止しました。");
  }
  if (env.SEED_DEMO_DATA === "true") {
    throw new HttpError(503, "DEMO_DATA_EXPOSED", "デモデータ作成が有効なため公開を停止しました。");
  }
  if (!isConfiguredHttpsUrl(env.TEAM_DOMAIN) || !isConfiguredAudience(env.POLICY_AUD)) {
    throw new HttpError(503, "AUTH_NOT_CONFIGURED", "Cloudflare Accessの認証設定が完了していません。");
  }
  if (env.ALLOW_OWNER_BOOTSTRAP === "true" && !env.OWNER_EMAIL?.includes("@")) {
    throw new HttpError(503, "OWNER_NOT_CONFIGURED", "初期ownerのメールアドレスが設定されていません。");
  }
}
