-- Phase 1-A: 本番を書いた経路の特定
-- docs/IMPORT_IMPROVEMENT_PLAN.md §Phase 1-A に対応
--
-- 実行方法（あなたの手元で、Cloudflareの認証情報を使って）：
--   npx wrangler d1 execute DB --remote --config .wrangler.production.jsonc \
--     --file scripts/sql/phase1a-batch-origin.sql
--
-- または wrangler.jsonc の binding 名が違う場合は --config を実際の設定ファイルに置き換えてください。
-- 読み取り専用です。書き込みは一切行いません。

-- 1. 現在のバッチ一覧と最終状態
SELECT id, name, status, expected_works, expected_notes, staged_works, staged_notes,
       applied_works, applied_notes, conflict_count,
       created_at, validated_at, committed_at, rolled_back_at, updated_at
FROM import_batches
ORDER BY created_at;

-- 2. 有効化・反映・取消の監査ログを時系列で
SELECT event_type, actor_id, target_id, details_json, created_at
FROM audit_events
WHERE event_type IN (
  'IMPORT_CENTER_ENABLED', 'IMPORT_CENTER_DISABLED', 'IMPORT_CENTER_EXTENDED',
  'IMPORT_BATCH_CREATED', 'IMPORT_BATCH_VALIDATED', 'IMPORT_BATCH_COMMITTED', 'IMPORT_BATCH_ROLLED_BACK'
)
ORDER BY created_at;

-- 3. 有効化イベントと、その直後の反映停止時刻の突き合わせ
-- （§1.1の仮説：60分ウィンドウ失効と反映停止が時刻的に一致するか）
-- 3-1 有効化イベント一覧（details_jsonのafter.enabled_untilを確認）
SELECT created_at AS enabled_at, details_json
FROM audit_events
WHERE event_type = 'IMPORT_CENTER_ENABLED'
ORDER BY created_at;

-- 3-2 各バッチの最終更新時刻（反映が止まった時刻の推定値）
SELECT id, status, updated_at, committed_at
FROM import_batches
WHERE status IN ('committing', 'failed')
ORDER BY updated_at;

-- 4. 現在の本番works件数（実測）
SELECT COUNT(*) AS active_works_count FROM works WHERE deleted_at IS NULL;
SELECT COUNT(*) AS active_notes_count FROM notes;

-- 5. source_key重複チェック（受入条件の1つ）
SELECT source_key, COUNT(*) AS count
FROM works
WHERE deleted_at IS NULL AND source_key IS NOT NULL
GROUP BY source_key
HAVING COUNT(*) > 1;

-- 6. Phase 1-Cのマイグレーション適用後は、origin列で経路が直接わかる
-- （0016_import_window_tracking.sql 適用後の新規バッチのみ）
-- SELECT id, origin, status, applied_works, created_at FROM import_batches ORDER BY created_at;
