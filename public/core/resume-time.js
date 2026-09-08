export function isEngagementResumeSource(source) {
  return source === "note" || source === "experience";
}

export function resumeRecencyLabel(value, source, now = Date.now()) {
  if (!value) return "";
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) return "";

  const elapsed = Math.max(0, now - timestamp);
  const day = 24 * 60 * 60 * 1000;
  const isWorkUpdate = !isEngagementResumeSource(source);

  if (isWorkUpdate) {
    if (elapsed < day) return "今日更新";
    if (elapsed < 7 * day) return "今週更新";
    if (elapsed < 30 * day) return "少し前に更新";
    return "最終更新から久しぶり";
  }

  if (elapsed < day) return "今日触った";
  if (elapsed < 7 * day) return "今週触った";
  if (elapsed < 30 * day) return "少し空いている";
  return "久しぶり";
}
