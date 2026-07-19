# 作品体験ログ

読書を中心に、本・映画・漫画・アニメ・ドラマとの関係を、表紙画像なし・テキスト中心で残す招待制Webアプリです。

## v0.2で改善した入力・編集

- 作品種別に合わせて、作者欄・状態名・進捗単位を自動変更
- PCの詳細ペインから状態・評価・一言・進捗をクイック編集
- スマホは保存操作を画面下部へ固定
- 新規入力の下書き保存・復元・破棄
- 編集中の未保存離脱を確認
- `Ctrl / Cmd + Enter`で保存
- 進捗が全体を超える入力を画面側とAPI側で拒否

## v0.3で改善した検索・整理

- 複数語をすべて含むAND検索
- 分類名の部分一致と複数分類AND検索
- ジャンル・テーマ・タグ候補を使用回数順で表示
- 現在の検索・絞り込み条件を名前付き保存
- 保存ビューの適用、起動時の既定表示、削除
- 適用中の絞り込みチップを個別解除
- 保存ビューは利用者ごとに分離

## v0.4で改善したメモ・体験履歴

- メモの編集・削除
- メモを自分の順番へ並び替え
- 更新順、作成順、メモ種別順への表示切替
- 再読・再視聴など体験履歴の編集・削除
- 体験履歴を初回順・最新順へ切替
- 各体験の評価が前回からどう変わったかを表示
- 初回評価から最新評価までの変化を要約
- メモ・体験履歴にも楽観ロックを適用
- 履歴変更後に作品の状態・評価・進捗を再同期

## v0.5で改善したビジュアル

- 明朝体を見出し・作品名へ限定し、操作部分はゴシック体で維持
- 紙の粒子、細い罫線、欄外注、通し番号による個人アーカイブの装丁
- 均等なカード配置をやめ、最初の一冊を大きく扱う非対称レイアウト
- 追加導線を朱色の切り欠きパネルとして独立
- 作品一覧をカードではなく目録として番号付きで表示
- 選択中の作品を朱色で反転し、右側詳細を雑誌の右ページとして構成
- フィルター領域を暗い索引ページとして分離
- ダイアログを編集用紙のような罫線中心の構成へ変更
- スマホでも同じ編集思想を維持
- 控えめなスクロール表示と`prefers-reduced-motion`対応

## v0.6で改善した公開・認証

- Cloudflare Accessを通過しないリクエストを全画面・API・Static Assetsで拒否
- Access JWTの署名、issuer、audienceをWorker内でも再検証
- Access通過後もD1の`members.status = active`を確認
- `/health`を含む全ルートをログイン必須化
- リモート環境で開発認証やデモデータが有効なら503で停止
- `workers.dev`を本番で無効化し、カスタムドメインだけを公開
- ローカル設定を`wrangler.dev.jsonc`へ分離
- GitHub ActionsからD1マイグレーション後に手動デプロイ
- D1 ID、ホスト名、Access設定などの必須値を公開前に検証
- 初回owner作成後にbootstrapを閉じる運用を整備

## 実装済み

- Cloudflare Access JWT検証（署名・issuer・audience・期限）
- ローカル開発時のみ使えるowner認証
- `members.status = active`を全リクエストで再確認
- owner / admin / member / viewerの権限基盤
- 招待、一時停止、ブロック、解除
- ブロック時はD1の状態更新を先に確定し、次のAPIから即時拒否
- Cloudflare Accessセッション失効API連携（任意設定）
- 作品、体験、メモ、ジャンル、テーマ、タグ
- 再読・再視聴を過去記録へ上書きせず追加
- タイトル、作者、分類、メモ本文の横断検索
- スマホ1カラム＋下部ナビ / PC 3カラム
- JSON / CSV / Markdownエクスポート
- 監査ログ、セキュリティイベント
- 楽観ロック、ソフト削除、CSRF対策、セキュリティヘッダー

## 技術構成

- Cloudflare Workers Static Assets
- Cloudflare D1
- Cloudflare Access
- TypeScript
- Vanilla HTML / CSS / JavaScript
- GitHub Actions

## ローカル起動

```bash
npm install
npm run db:migrate:local
npm run dev
```

ローカル起動は`wrangler.dev.jsonc`を使い、`localhost / 127.0.0.1 / 0.0.0.0`だけ開発用ownerとして動作します。本番の`wrangler.jsonc`には開発ログイン情報を置きません。

## チェック

```bash
npm run check
npm run dry-run
```

`npm run check`はTypeScript、フロントエンドJavaScript構文、全Nodeテストを確認します。

## 本番公開

公開手順は次の文書へまとめています。

- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

概要：

1. Cloudflare D1を作成
2. カスタムドメイン用のCloudflare Accessアプリを作成
3. ownerのメールだけをAllow policyへ登録
4. GitHub Environment `production`へSecrets / Variablesを登録
5. `Deploy production`ワークフローを手動実行
6. ownerで初回ログイン
7. `ALLOW_OWNER_BOOTSTRAP=false`へ変更して再デプロイ

本番設定は`.wrangler.production.jsonc`として実行時に生成され、Git管理されません。

## API概要

- `GET /health`（ログイン必須）
- `GET /api/me`
- `GET /api/home`
- `GET/POST /api/works`
- `GET/PATCH/DELETE /api/works/:id`
- `POST /api/works/:id/experiences`
- `POST /api/works/:id/notes`
- `POST /api/works/:id/notes/reorder`
- `PATCH/DELETE /api/notes/:id`
- `PATCH/DELETE /api/experiences/:id`
- `GET /api/labels`
- `GET/POST /api/saved-views`
- `PATCH/DELETE /api/saved-views/:id`
- `GET /api/export?format=json|csv|markdown`
- `GET /api/admin/users`
- `POST /api/admin/invitations`
- `POST /api/admin/users/:id/suspend`
- `POST /api/admin/users/:id/block`
- `POST /api/admin/users/:id/unblock`
- `POST /api/admin/users/:id/revoke`
- `GET /api/admin/security-events`

## MVP後に残るもの

- Access認証ログの自動取り込み
- 作品同士の関連付けUI
- インポート
- viewer向け限定共有画面
- 完全削除・匿名化の正式な運用ルール

## Windows / OneDriveでの注意

- `node_modules`はOneDrive同期対象外のフォルダで作成することを推奨します。
- PowerShellの実行ポリシーで`npm`が止まる場合は`npm.cmd`を使用してください。
- 公開npmレジストリ`https://registry.npmjs.org/`を使用します。
