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
- GitHub repository

## ローカル起動

```bash
npm install
npm run db:migrate:local
npm run dev
```

表示された `http://localhost:8787` を開きます。ローカル環境だけ、`wrangler.jsonc` の開発用ownerでログイン済みとして動作します。初回アクセス時にownerとデモデータを作成します。

開発用認証はコード上でも `localhost / 127.0.0.1 / 0.0.0.0` に限定しており、公開URLでは利用できません。

## チェック

```bash
npm run check
npm run dry-run
```

## Cloudflareへ配置

### 1. D1を作成

```bash
npx wrangler d1 create sakuhin-log
```

表示された `database_id` を `wrangler.jsonc` の `d1_databases` に設定します。

```bash
npm run db:migrate:remote
```

### 2. 本番環境変数を設定

Cloudflare Workersの環境変数へ設定します。

- `APP_ENV=production`
- `DEV_AUTH_ENABLED=false`
- `OWNER_EMAIL=最初のownerのメールアドレス`
- `ALLOW_OWNER_BOOTSTRAP=true`（owner作成後はfalse推奨）
- `SEED_DEMO_DATA=false`
- `TEAM_DOMAIN=https://<team>.cloudflareaccess.com`
- `POLICY_AUD=<Access Application Audience Tag>`

管理画面からセッション失効を行う場合のみSecretを設定します。

```bash
npx wrangler secret put CF_API_TOKEN
npx wrangler secret put CF_ACCOUNT_ID
```

APIトークンには、Cloudflare Accessのユーザーセッションを失効できる最小権限を付与します。

### 3. Cloudflare Accessを設定

Workerの本番URL全体をSelf-hosted applicationとして保護します。

- ログイン方式：GoogleまたはメールのワンタイムPIN
- セッション期間：初期案24時間
- Preview URLにもAccessを有効化
- Worker内でもAccess JWTを再検証

Accessで本人確認に成功しても、D1に招待・active状態がなければアプリは拒否します。

### 4. GitHubで管理

1. Cloudflare Workers Buildsでこのリポジトリを接続
2. Build command: `npm run check`
3. Deploy command: `npx wrangler deploy`

Cloudflare側の本番環境変数とSecretはGitHubへ保存しません。

## API概要

- `GET /api/me`
- `GET /api/home`
- `GET/POST /api/works`
- `GET/PATCH/DELETE /api/works/:id`
- `POST /api/works/:id/experiences`
- `POST /api/works/:id/notes`
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

- `node_modules` はOneDrive同期対象外のフォルダ（例: `C:\dev\contentlibrary`）で作成することを推奨します。
- PowerShellの実行ポリシーで `npm` が止まる場合は `npm.cmd` を使用してください。
- この配布版は公開npmレジストリ `https://registry.npmjs.org/` を使用します。
