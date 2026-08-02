// 通常のfetch。window.fetchの乗っ取りはしない — 誰が何を投げているか常に追える状態を保つ。
export async function api(path, options = {}) {
  const method = options.method || "GET";
  const headers = new Headers(options.headers || {});
  if (!["GET", "HEAD"].includes(method)) headers.set("X-App-Request", "sakuhin-log");
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...options, method, headers });
  const type = response.headers.get("content-type") || "";
  if (!response.ok) {
    let data = {};
    if (type.includes("application/json")) data = await response.json().catch(() => ({}));
    const error = new Error(data?.error?.message || `エラー ${response.status}`);
    error.status = response.status;
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    if (response.status === 401) {
      document.dispatchEvent(new CustomEvent("app:auth-lost"));
      setTimeout(() => location.reload(), 1000);
    }
    throw error;
  }
  if (type.includes("application/json")) return response.json();
  return response;
}
