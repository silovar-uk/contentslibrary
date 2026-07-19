export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ENV?: string;
  DEV_AUTH_ENABLED?: string;
  DEV_AUTH_EMAIL?: string;
  DEV_AUTH_SUB?: string;
  OWNER_EMAIL?: string;
  ALLOW_OWNER_BOOTSTRAP?: string;
  SEED_DEMO_DATA?: string;
  TEAM_DOMAIN?: string;
  POLICY_AUD?: string;
  CF_API_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
}

export type Role = "owner" | "admin" | "member" | "viewer";
export type MemberStatus = "invited" | "active" | "suspended" | "blocked" | "removed";

export interface Member {
  id: string;
  access_subject: string | null;
  email: string;
  display_name: string | null;
  role: Role;
  status: MemberStatus;
  suspended_until: string | null;
  blocked_at: string | null;
  blocked_by: string | null;
  blocked_reason: string | null;
  created_at: string;
  activated_at: string | null;
  last_login_at: string | null;
  updated_at: string;
}

export interface AuthContext {
  member: Member;
  claims: Record<string, unknown>;
  isDev: boolean;
}

export type WorkType = "book" | "manga" | "movie" | "anime" | "drama" | "other";
export type WorkStatus = "want" | "owned_unread" | "active" | "completed" | "paused" | "dropped";
export type LabelKind = "genre" | "theme" | "tag";
