const EXPORT_FORMATS = new Set(['json', 'csv', 'markdown']);

function exportToast(message, type = 'success') {
  const region = document.querySelector('#toastRegion');
  if (!region) return;
  const element = document.createElement('div');
  element.className = `toast ${type === 'error' ? 'error' : ''}`;
  element.textContent = message;
  region.append(element);
  setTimeout(() => element.remove(), 4200);
}

function exportFilename(response, format) {
  const disposition = response.headers.get('content-disposition') || '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded); } catch {}
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  if (plain) return plain;
  const extension = format === 'markdown' ? 'md' : format;
  return `sakuhin-log-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

async function exportError(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json().catch(() => ({}));
    return data?.error?.message || `エラー ${response.status}`;
  }
  return (await response.text().catch(() => '')).trim() || `エラー ${response.status}`;
}

async function downloadExport(format, trigger) {
  const originalText = trigger.textContent;
  trigger.disabled = true;
  trigger.textContent = '書き出し中…';
  try {
    // 共通api()はJSONをオブジェクトへ変換するため、ファイル取得は生のResponseを使う。
    const response = await fetch(`/api/export?format=${encodeURIComponent(format)}`, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { Accept: format === 'json' ? 'application/json' : '*/*' }
    });
    if (!response.ok) throw new Error(await exportError(response));

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFilename(response, format);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    exportToast(`${format.toUpperCase()}を書き出しました。`);
  } catch (error) {
    exportToast(error instanceof Error ? error.message : '書き出しに失敗しました。', 'error');
  } finally {
    trigger.disabled = false;
    trigger.textContent = originalText;
  }
}

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('[data-export]') : null;
  const format = target?.dataset.export;
  if (!target || !format || !EXPORT_FORMATS.has(format)) return;

  // 旧ハンドラーがapi()の戻り値へblob()を呼ばないよう、書き出し操作だけを差し替える。
  event.preventDefault();
  event.stopImmediatePropagation();
  void downloadExport(format, target);
}, true);
