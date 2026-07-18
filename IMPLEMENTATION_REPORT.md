# 実装レポート v0.6

## 実装範囲

- Cloudflare Access JWTとD1の利用状態を組み合わせた二段階判定
- owner / admin / member / viewer
- 招待、一時停止、ブロック、解除、任意のAccessセッション失効
- 作品・体験・メモ・ジャンル・テーマ・タグ
- 再読・再視聴の履歴追加・編集・削除
- タイトル・作者・分類・メモの横断検索
- 保存ビュー
- 読書を優先したホーム
- スマホ1カラム・下部ナビ、PC 3カラム
- JSON / CSV / Markdownエクスポート

## v0.5 ビジュアルリファイン

- 明朝体とゴシック体の役割分担
- 紙の粒子、欄外注、通し番号、細い罫線を使った編集的な装丁
- 最初の読書カードを大きく扱う非対称グリッド
- 朱色の切り欠き型クイック追加パネル
- 一覧をカードではなく目録として見せる連番構成
- 選択中の作品を反転し、右側詳細を誌面の右ページとして表現
- 暗い索引ページとしてのフィルターパネル
- 編集用紙を意識したダイアログ
- スマホでも同じデザイン言語を維持
- IntersectionObserverによる控えめな表示モーション
- `prefers-reduced-motion`対応

## v0.6 本番公開・ログイン必須化

- `/`、`/api/*`、`/health`、Static Assetsをすべて認証後に処理
- Cloudflare Access JWTの署名、issuer、audienceをWorker内で再検証
- Access通過後もD1の`members.status`と権限・所有権を再確認
- リモート環境で`APP_ENV != production`なら503で停止
- リモート環境で開発認証またはデモデータが有効なら503で停止
- Access Team Domain / Audience未設定時は503で停止
- 初期owner bootstrap有効時のメール設定を検証
- 本番の`workers.dev`を無効化
- カスタムドメインのみを生成設定へ登録
- ローカル設定を`wrangler.dev.jsonc`へ分離
- 本番設定を環境変数から`.wrangler.production.jsonc`へ安全に生成
- GitHub Environment `production`を使う手動デプロイワークフロー
- D1マイグレーション成功後だけWorkerをデプロイ
- 初回owner作成後にbootstrapを無効化する運用手順
- Access policyとアプリ内招待の二重登録手順

## 検証結果

- TypeScript型検査
- フロントエンドJavaScript構文確認
- Nodeテスト 26件
- 本番設定生成の成功・必須値不足時の停止
- カスタムドメイン、`workers_dev=false`、D1 ID、Access値の生成確認
- 全ルートが認証後に処理されることを確認
- 既存の認証、所有権、検索、保存ビュー、履歴編集テスト
- Wrangler deploy dry-run
- GitHub Actions

## 実Cloudflare環境で残る作業

- Cloudflare D1を1つ作成
- 利用するカスタムドメインを決定
- Cloudflare Access self-hosted applicationを作成
- Access Allow policyへ最初のownerメールを登録
- GitHub Environment `production`へSecrets / Variablesを登録
- `Deploy production`を手動実行
- ownerで初回ログイン後、`ALLOW_OWNER_BOOTSTRAP=false`へ変更して再デプロイ
- 実IdP・スマートフォン・複数ブラウザで本番E2E確認
- Access認証ログの自動取り込みは未実装

詳細手順は`docs/DEPLOYMENT.md`を参照してください。
