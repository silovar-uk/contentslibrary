# Engagement Semantics Foundation

## 背景

CONTINUE 2.0 は `resume_at` を使い「今日触った / 今週触った / 少し空いている / 久しぶり」を表示している。

しかし `works.updated_at` は作品体験だけの時刻ではない。一般編集・評価・お気に入り・表紙・metadata 更新でも変更されるため、`works.updated_at` をそのまま「触った」と表現すると意味が過剰になる。

## 今回の判断

RETURN / RESCUEや並び替えを先に実装せず、時刻の意味を分離する。

### `engagement_at`

作品体験への高信頼な接点。

- latest note `updated_at`
- latest experience `updated_at`

の新しい方。どちらも存在しない場合は `null`。

`works.updated_at` は含めない。

### `resume_at`

CONTINUEで利用できる最新の手掛かり。

- note
- experience
- work update

の新しい方。

### `resume_source`

`resume_at` が何を表すかを明示する。

- `note`
- `experience`
- `work_update`

## UI

`note` / `experience` がsourceの場合のみ「触った」という体験寄りの表現を使用する。

- 今日触った
- 今週触った
- 少し空いている
- 久しぶり

`work_update` の場合は管理上の更新である可能性を残し、「更新」と表現する。

- 今日更新
- 今週更新
- 少し前に更新
- 最終更新から久しぶり

これにより、タイトル編集や表紙変更を「作品を読んだ・観た」と誤認させない。

## 意図的に変えないもの

- CONTINUEの `updated_at DESC` 並び
- 表示件数8件
- status
- reading_priority
- DB schema
- CHOOSE / EXPLORE / REFLECT

## RETURN / RESCUEへの接続

次フェーズでは `engagement_at` を高信頼の候補判定に使える。

ただし直接progressをwork PATCHした場合は現在 `engagement_at` に入らないため、RESCUE判定では `works.updated_at` も安全弁として併用し、最近更新された作品を誤って救出しない設計を優先する。

## Acceptance Criteria

- `engagement_at` はnote / experienceだけから導出される
- `resume_at` はnote / experience / work updateの最新を維持する
- `resume_source` がAPIで返る
- work updateが最新の場合、「触った」と表示しない
- note / experienceが最新の場合、従来の自然な再開表現を維持する
- CONTINUEの並び順を変更しない
- DB migrationを追加しない
