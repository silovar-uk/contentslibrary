# Progress Engagement Semantics

## 1. 目的

Resume Signals / Contextual Rescue が「作品に触れた時刻」を扱う際、note / experienceを伴わない進捗変更も高信頼なengagementとして扱えるようにする。

## 2. 背景

現在の `works.updated_at` は、進捗だけでなくタイトル・評価・表紙・metadata等の管理更新でも変わる。

一方、詳細画面のクイック編集では `progress_current` / `progress_total` をwork PATCHで直接更新できる。この操作は実質的に作品へ触れた記録だが、従来の `engagement_at` には含まれていなかった。

## 3. 今回の判断

`works.progress_engagement_at` を追加する。

これは一般的な更新時刻ではなく、**note / experienceを伴わないwork PATCH上の進捗変更を補完するengagement時刻**として扱う。

既存データは推測でbackfillせず `NULL` のままにする。

## 4. 更新条件

`PATCH /api/works/:id` で、以下のどちらかが実際に変化した場合だけ更新する。

- `progress_current`
- `progress_total`

同じ値を再送しただけでは更新しない。

以下だけを変更した場合も更新しない。

- title
- creator
- rating
- favorite
- cover
- metadata
- short_note
- unit_label
- status
- labels

## 5. 成功境界

`progress_engagement_at` はwork PATCH本体が成功した後だけ記録する。

- validation error: 記録しない
- 404: 記録しない
- 409 conflict: 記録しない
- work PATCH成功 + progress実変更: 記録する

補助シグナルの記録だけが失敗した場合は、すでに成功したwork更新をエラー扱いに戻さない。

## 6. Version / updated_at

`progress_engagement_at` のシステム記録では、以下を変更しない。

- `version`
- `updated_at`

ユーザー操作そのもののwork PATCHで既存どおり `version` / `updated_at` が更新される。

## 7. Resume Semantics

`engagement_at` は以下の最新とする。

- latest note `updated_at`
- latest experience `updated_at`
- `works.progress_engagement_at`

`works.updated_at` はengagementには含めない。

`resume_at` は引き続き、engagementとwork updateの最新手掛かり。

`resume_source` は以下を許可する。

- `note`
- `experience`
- `progress`
- `work_update`

`progress` は「触った」側の表現を使う。

## 8. Contextual Rescue

Rescue候補の `rescue_engagement_at` も、以下の最新を使う。

- note
- experience
- progress engagement

これにより、最近進捗だけ更新した作品を「長く触れていない」と誤判定しない。

既存の安全弁 `works.updated_at <= cutoff` も維持する。

## 9. Experienceとの関係

experience追加・更新は既に `experiences.updated_at` でengagementとして記録される。

そのため、experience経由でworkの進捗値が変化しても `progress_engagement_at` へ二重記録する必要はない。

## 10. Migration

`0019_progress_engagement.sql`

```sql
ALTER TABLE works ADD COLUMN progress_engagement_at TEXT;
```

indexは追加しない。Rescueは候補を `updated_at` で絞った後、最大1件を選ぶ補助クエリであり、現段階では専用indexの必要性がない。

## 11. MUST

- progress実変更時だけ記録
- 同値再送では記録しない
- progressを含まないPATCHでは記録しない
- 409時は記録しない
- note / experience / progressをengagementとして統合
- work updateはengagementへ混ぜない
- Rescueがprogressを考慮する
- 既存データをbackfillしない
- DB migrationをproduction deploy前に適用する

## 12. LATER

- 進捗変更の差分量をactivityとして使うか
- progress engagementを履歴として複数保持するか
- threshold calibrationへの利用

## 13. REJECTED

- `works.updated_at` を進捗engagementの代用にする
- metadata JSONへシステム時刻を隠す
- audit_eventsを毎回JOINしてengagementを推測する
- 既存作品の進捗値から過去時刻を推測してbackfillする
