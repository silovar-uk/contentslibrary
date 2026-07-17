export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; ")
};

export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return withSecurityHeaders(new Response(JSON.stringify(data), { status, headers }));
}

export function text(body: string, status = 200, contentType = "text/plain; charset=utf-8"): Response {
  return withSecurityHeaders(new Response(body, { status, headers: { "Content-Type": contentType } }));
}

export async function parseJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new HttpError(415, "UNSUPPORTED_MEDIA_TYPE", "JSON形式で送信してください。");
  }
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "INVALID_JSON", "JSONを読み取れませんでした。");
  }
}

export function assertSameOriginMutation(request: Request): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  const marker = request.headers.get("x-app-request");
  if (!origin || origin !== expected || marker !== "sakuhin-log") {
    throw new HttpError(403, "REQUEST_REJECTED", "この操作を実行できません。");
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json({ error: { code: error.code, message: error.message, details: error.details ?? null } }, error.status);
  }
  console.error("Unhandled error", error instanceof Error ? error.stack : error);
  return json({ error: { code: "INTERNAL_ERROR", message: "処理中に問題が発生しました。入力内容は保持したまま、もう一度お試しください。" } }, 500);
}
