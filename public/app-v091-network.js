const nativeFetch = globalThis.fetch.bind(globalThis);
const transientStatuses = new Set([502, 503, 504]);
const retryDelays = [500, 1400];

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function requestDetails(input, init = {}) {
  const requestMethod = input instanceof Request ? input.method : 'GET';
  const method = String(init.method || requestMethod || 'GET').toUpperCase();
  const rawUrl = input instanceof Request ? input.url : String(input);
  const url = new URL(rawUrl, globalThis.location?.origin || 'https://local.invalid');
  return { method, url };
}

function isRetryableImportRequest(method, url) {
  if (!url.pathname.startsWith('/api/admin/import')) return false;
  if (method === 'DELETE') return false;
  return ['GET', 'HEAD', 'POST', 'PUT', 'PATCH'].includes(method);
}

function cloneInput(input) {
  return input instanceof Request ? input.clone() : input;
}

function unavailableResponse(response) {
  const headers = new Headers(response.headers);
  const ray = headers.get('cf-ray');
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  const suffix = ray ? `（Cloudflare Ray: ${ray}）` : '';
  const body = JSON.stringify({
    error: {
      code: 'IMPORT_SERVICE_TEMPORARILY_UNAVAILABLE',
      message: `取込センターへの接続が一時的に不安定です${suffix}。本番データは変更されていません。30秒ほど待って「更新」を押してください。`
    }
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

globalThis.fetch = async function resilientImportFetch(input, init = {}) {
  const { method, url } = requestDetails(input, init);
  const retryable = isRetryableImportRequest(method, url);
  const attempts = retryable ? retryDelays.length + 1 : 1;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await nativeFetch(cloneInput(input), init);
      if (!transientStatuses.has(response.status)) return response;

      if (attempt < attempts - 1) {
        try { await response.body?.cancel(); } catch {}
        await wait(retryDelays[attempt]);
        continue;
      }

      const contentType = response.headers.get('content-type') || '';
      return contentType.includes('application/json') ? response : unavailableResponse(response);
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await wait(retryDelays[attempt]);
        continue;
      }
    }
  }

  if (retryable) {
    throw new Error('取込センターへ接続できませんでした。本番データは変更されていません。通信状態を確認し、30秒ほど待って「更新」を押してください。', { cause: lastError });
  }
  throw lastError;
};
