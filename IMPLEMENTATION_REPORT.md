# 実装レポート v0.2

## 実装範囲

- Cloudflare Access JWTとD1の利用状態を組み合わせた二段階判定
- owner / admin / member / viewer
- 招待、一時停止、ブロック、解除、任意のAccessセッション失効
- 作品・体験・メモ・ジャンル・テーマ・タグ
- 再読・再視聴の履歴追加
- タイトル・作者・分類・メモの横断検索
- 読書を優先したホーム
- スマホ1カラム・下部ナビ、PC 3カラム
- JSON / CSV / Markdownエクスポート
- 監査ログ、セキュリティイベント

## v0.2追加実装

- 媒体別の入力ラベル・状態表示・進捗単位
- PC詳細ペインのクイック編集
- スマホフォームの固定保存エリア
- 新規入力の下書き自動保存・復元・破棄
- 編集時の未保存離脱確認
- クライアント／API双方の進捗整合性チェック
- キーボード保存ショートカット

## 検証結果

- 依存パッケージのインストール: 成功
- TypeScript型検査: 成功
- Nodeテスト: 7件成功、失敗0件
- Wrangler dry-run: 成功
- ローカルD1マイグレーション: 成功
- API結合確認: 正常な進捗は保存、現在位置が全体を超える更新は422で拒否
- 初期実装の作品作成、検索、招待、ブロック後403を維持

## 未実施・本番時に必要な作業

- 実CloudflareアカウントでD1を作成し、`database_id`を設定
- Cloudflare Access Applicationを作成し、`TEAM_DOMAIN`と`POLICY_AUD`を設定
- 実IdPでの本番ログイン確認
- セッション失効を使う場合、Cloudflare API Secretを設定
- 実機・複数ブラウザでのE2E試験

## 画面プレビュー

- `docs/preview-desktop.png`
- `docs/preview-mobile.png`
