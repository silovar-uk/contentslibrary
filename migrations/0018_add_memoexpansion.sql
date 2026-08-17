INSERT INTO works (
  id,
  owner_id,
  type,
  title,
  creator,
  release_year,
  status,
  rating,
  short_note,
  visibility,
  progress_current,
  progress_total,
  unit_label,
  metadata_json,
  search_text,
  version,
  created_at,
  updated_at,
  deleted_at,
  source_key
)
SELECT
  '9d75c1ca-9c25-4e8d-8c53-0f84e8d5cf2e',
  m.id,
  'other',
  'MemoTool',
  'silovar-uk',
  2026,
  'active',
  NULL,
  'Chromeのサイドパネルで使うメモツール。タブ切り替え、装飾、行番号ジャンプ、日時表示、詳細連動移動、1行自動縮小表示に対応。',
  'private',
  NULL,
  NULL,
  NULL,
  '{"official_url":"https://github.com/silovar-uk/memoexpansion","repository_url":"https://github.com/silovar-uk/memoexpansion","app_kind":"Chrome extension","version":"2.1.0"}',
  'memotool memo tool メモツール chrome extension chrome拡張 サイドパネル メモ memoexpansion silovar-uk',
  1,
  '2026-08-17T08:12:00.000Z',
  '2026-08-17T08:12:00.000Z',
  NULL,
  'github:silovar-uk/memoexpansion'
FROM members AS m
WHERE m.role = 'owner'
  AND m.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM works
    WHERE source_key = 'github:silovar-uk/memoexpansion'
      AND deleted_at IS NULL
  )
ORDER BY m.created_at ASC
LIMIT 1;
