# 本番公開・ログイン必須化手順

このアプリは、次の二重判定で公開します。

1. **Cloudflare Access**が、許可された本人かを確認する
2. **Worker + D1**が、アプリ内で`active`な利用者かを確認する

Accessを通過しただけでは利用できず、D1にownerまたは招待済みユーザーとして登録されている必要があります。

## 公開後の構成

```text
利用者
  ↓ Cloudflare Accessログイン
カスタムドメイン（例：library.example.com）
  ↓ Cf-Access-Jwt-Assertion
Cloudflare Worker
  ├─ JWT署名・issuer・audience検証
  ├─ D1 members.status確認
  ├─ Static Assets
  └─ D1 作品データ
```

`workers.dev`は本番では無効にし、カスタムドメインだけを公開します。

---

## 1. 先に用意するもの

- Cloudflareアカウント
- Cloudflareで管理しているドメイン
- Cloudflare Zero Trust
- GitHubリポジトリの管理権限
- 最初のownerとして使うメールアドレス

本番ホスト名は、たとえば次のように決めます。

```text
library.example.com
```

カスタムドメインに既存のCNAMEレコードがある場合は、先に競合を解消してください。

---

## 2. D1データベースを作る

CloudflareへログインできるPCで、リポジトリのフォルダから実行します。

```bash
npx wrangler login
npx wrangler d1 create sakuhin-log
```

表示された`database_id`を控えます。

例：

```text
123e4567-e89b-12d3-a456-426614174000
```

この値はGitHub Secretの`D1_DATABASE_ID`へ登録します。リポジトリ内のファイルへ直接書き込む必要はありません。

---

## 3. Cloudflare Accessアプリを作る

Cloudflare Zero Trustで、次の順に進みます。

```text
Access controls
→ Applications
→ Create new application
→ Self-hosted and private
→ Add public hostname
```

### Public hostname

```text
Subdomain: library
Domain: example.com
Path: 空欄
```

### 最初のAllow policy

最初はowner本人だけを許可します。

```text
Action: Allow
Include: Emails
Value: owner@example.com
```

ログイン方法は、次のどちらかが扱いやすいです。

- Google
- One-time PIN

単一のログイン方法だけを使う場合は、Instant authenticationを有効にすると、Cloudflareの選択画面を省略できます。

Accessアプリ作成後、次の2値を控えます。

```text
TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
POLICY_AUD=<Application Audience Tag>
```

`POLICY_AUD`は、そのAccessアプリ専用のAudienceタグです。別アプリの値を使わないでください。

---

## 4. GitHubのproduction環境を作る

GitHubで次の順に進みます。

```text
Repository
→ Settings
→ Environments
→ New environment
→ production
```

### Environment Secrets

| 名前 | 内容 |
|---|---|
| `CLOUDFLARE_API_TOKEN` | WorkersとD1を操作できるCloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `D1_DATABASE_ID` | 手順2で作成したD1のID |

API Tokenは対象アカウント・対象ゾーンに絞り、必要最小限の権限にします。

### Environment Variables

| 名前 | 初回の値 |
|---|---|
| `APP_HOSTNAME` | `library.example.com` |
| `TEAM_DOMAIN` | `https://<team-name>.cloudflareaccess.com` |
| `POLICY_AUD` | Access Application Audience Tag |
| `OWNER_EMAIL` | 最初のownerのメールアドレス |
| `ALLOW_OWNER_BOOTSTRAP` | `true` |
| `WORKER_NAME` | `sakuhin-log` |

`TEAM_DOMAIN`、`POLICY_AUD`、`OWNER_EMAIL`は機密情報ではありませんが、環境ごとの設定としてGitHub Variablesで管理します。

---

## 5. GitHub Actionsから公開する

PRを`main`へマージしたあと、GitHubで次の順に進みます。

```text
Actions
→ Deploy production
→ Run workflow
→ Branch: main
→ Run workflow
```

ワークフローは次の順で処理します。

1. 依存関係をインストール
2. 型検査・JavaScript構文・全テスト
3. 本番設定値を検証
4. D1マイグレーションを適用
5. WorkerとStatic Assetsをカスタムドメインへデプロイ

必須値が欠けている場合や、ダミーのAudience・D1 IDが残っている場合は、公開前に停止します。

---

## 6. 最初のownerを作る

デプロイ成功後、次のURLへアクセスします。

```text
https://library.example.com
```

1. Cloudflare Accessで`OWNER_EMAIL`のアドレスを使ってログイン
2. WorkerがAccess JWTを検証
3. D1にownerがまだ存在しない場合だけ、ownerを1名作成
4. アプリのホームが表示される

ownerが作成されたら、GitHubのproduction Variableを変更します。

```text
ALLOW_OWNER_BOOTSTRAP=false
```

変更後、もう一度`Deploy production`を実行します。

これにより、初期ownerの自動作成経路を閉じます。すでに作成済みのownerは引き続き利用できます。

---

## 7. ほかのユーザーを追加する

追加ユーザーは、Access側とアプリ側の**両方**へ登録します。

### Access側

Allow policyへ対象メールアドレスを追加します。

### アプリ側

ownerでログインし、管理画面から招待を作成します。

```text
メールアドレス
役割：member / viewer / admin
```

対象者が初回ログインすると、Accessの本人情報とD1の招待が一致した場合のみ`active`になります。

片方だけ設定した場合：

- Accessだけ許可：アプリ側が403で拒否
- アプリだけ招待：Accessのログイン手前で拒否

---

## 8. 公開後の確認

### 未ログイン

シークレットウィンドウで開き、Cloudflare Accessのログインへ移動することを確認します。

### 許可されていないメール

Accessで拒否されることを確認します。

### Accessだけ許可したメール

アプリ側で「このページを利用できません」となることを確認します。

### owner

作品の追加・編集・検索・メモ・エクスポートを確認します。

### ログアウト

設定画面のログアウト後、再度Accessログインが必要になることを確認します。

### 保護対象

次もログイン必須です。

```text
/
/api/*
/health
CSS・JavaScriptなどのStatic Assets
```

---

## 9. 公開事故を防ぐ仕組み

リモート環境で次の状態を検出すると、Workerは503で停止します。

- `APP_ENV`が`production`ではない
- `DEV_AUTH_ENABLED=true`
- `SEED_DEMO_DATA=true`
- `TEAM_DOMAIN`が未設定・ダミー
- `POLICY_AUD`が未設定・ダミー
- owner bootstrap有効時に`OWNER_EMAIL`がない

また、本番設定は次の状態で生成されます。

```text
workers_dev=false
DEV_AUTH_ENABLED=false
SEED_DEMO_DATA=false
カスタムドメインのみ
```

ローカル設定は`wrangler.dev.jsonc`へ完全に分離しています。

---

## 10. さらに事故耐性を上げる設定

Cloudflare Zero TrustのAccess settingsには、Accessアプリが存在しないホスト名を既定で遮断する設定があります。

同じCloudflareアカウント内の公開サイトへの影響を確認した上で、次を検討します。

```text
Access controls
→ Access settings
→ Block traffic to all domains in this account
```

有効にすると、Accessアプリを作り忘れた新規ホスト名も既定でブロックされます。

---

## 11. セッション失効機能を使う場合

アプリ管理画面からCloudflare Accessセッションを失効する場合だけ、Worker Secretを追加します。

```bash
npx wrangler secret put CF_API_TOKEN --config .wrangler.production.jsonc
npx wrangler secret put CF_ACCOUNT_ID --config .wrangler.production.jsonc
```

これはGitHub Actionsがデプロイに使う`CLOUDFLARE_API_TOKEN`とは別用途です。セッション失効機能を使わない場合は設定不要です。

---

## 12. 運用の原則

- 本番データベースをローカル開発へ接続しない
- API TokenやSecretをリポジトリへコミットしない
- ユーザー停止・ブロックは、まずD1側の状態を変更する
- D1マイグレーションはデプロイ前に自動適用する
- owner bootstrapは初回ログイン後すぐ無効化する
- Access policyとアプリ内ユーザーを定期的に照合する
