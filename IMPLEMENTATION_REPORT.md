# 実装レポート v0.1

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

## 検証結果

- `npm install`: 成功
- TypeScript型検査: 成功
- Nodeテスト: 5件成功、失敗0件
- Wrangler dry-run: 成功
- ローカルD1マイグレーション: 成功
- API結合確認: owner作成、検索、作品作成、招待、member有効化、block後403を確認
- デスクトップ・スマートフォンの主要画面を画像で確認

## 未実施・本番時に必要な作業

- 実CloudflareアカウントでD1を作成し、`database_id`を設定
- Cloudflare Access Applicationを作成し、`TEAM_DOMAIN`と`POLICY_AUD`を設定
- 実IdPでの本番ログイン確認
- セッション失効を使う場合、Cloudflare API Secretを設定
- 実機・複数ブラウザでのE2E試験
- `package-lock.json`のリポジトリ登録とCIの`npm ci`化

## 画面プレビュー

配布版には以下のプレビュー画像を含みます。GitHubリポジトリへの画像登録は、コード初期投入後に別コミットで行います。

- `docs/preview-desktop.png`
- `docs/preview-mobile.png`
