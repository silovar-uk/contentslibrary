# Contextual Rescue 仕様

## 1. 目的

CONTINUEの上位棚から視界外へ落ちたactive作品を、通常の続きを邪魔せず1件だけ思い出せるようにする。

Rescueは管理・通知ではなく、過去の自分との接点を復元する補助線として扱う。

## 2. Research / Decision

比較した候補:

- Strict Contextual Rescue
- Permissive Rescue
- Active Hygiene
- No New Surface

今回は Strict Contextual Rescue を採用する。

理由:

- `works.updated_at` は表紙・評価・metadata等でも更新されるため、単独で「最後に触れた時刻」とは扱えない
- `engagement_at` はnote / experienceだけから導出できるため、Rescue判定の信頼度が高い
- progressだけのwork PATCHは `engagement_at` に入らないため、`works.updated_at` も安全弁として併用する
- false positiveを減らすことを、拾える件数より優先する

## 3. Candidate 条件

すべて満たす作品のみ対象。

- ownerが現在ユーザー
- `deleted_at IS NULL`
- `status = 'active'`
- 通常CONTINUEの `updated_at DESC LIMIT 8` に含まれない
- noteまたはexperienceが1件以上あり、`engagement_at` が存在する
- `engagement_at` が30日以上前
- `works.updated_at` も30日以上前

30日は心理的な正解値ではなく、初期実装で誤救出を抑えるためのconservative defaultとして扱う。

## 4. Candidate 選択

条件を満たす候補のうち、`engagement_at` が最も新しい1件を返す。

古い順に掘り返さず、「通常の棚から少し離れた作品」を優先する。

同じ `engagement_at` の場合は `updated_at DESC` をtie-breakerとする。

## 5. API

`GET /api/home/rescue`

レスポンス:

```json
{
  "rescue": null
}
```

または:

```json
{
  "rescue": {
    "id": "...",
    "title": "...",
    "creator": "...",
    "resume_note": "...",
    "engagement_at": "...",
    "resume_at": "...",
    "resume_source": "..."
  }
}
```

既存 `/api/home` の責務・並び順は変更しない。

## 6. UI

CONTINUEのFeatured Shelf内で、通常のreading stripの下に1件だけ置く。

独立した5番目のHome zoneは作らない。
通常カード列にも混ぜない。

コピー:

- eyebrow: `REMEMBER`
- title: `これ、途中だった。`
- helper: `最近の棚から少し離れていた作品をひとつ。`
- CTA: `もう一度見る →`

作品タイトル、creator、前回メモがあれば短く表示する。

主操作は作品詳細を開くことだけ。

## 7. Tone

禁止:

- 放置しています
- 忘れています
- 30日読んでいません
- 再開してください

罪悪感や通知感を作らない。

## 8. Empty / Loading / Error

- 対象なし: 何も表示しない
- loading: skeletonを増やさず、何も表示しない
- API error: CONTINUE本体を壊さず、Rescueだけ表示しない

Rescueは補助機能なので、失敗をHome全体のtoastにはしない。

## 9. Refresh

- 初期Home表示時に取得
- library/detailからHomeへ戻ったとき再取得
- 新しいMutationObserverは追加しない

## 10. Mobile

- 通常の横スワイプ棚の外、下に置く
- 横カルーセルへ混ぜない
- タップ領域44px相当以上
- 前回メモは最大3行

## 11. Performance

- Rescueは最大1件
- DB migrationは追加しない
- 既存indexを利用する
- note / experienceの最新値は既存work単位indexを利用する
- client側でactive全件を取得して判定しない

## 12. MUST

- 通常CONTINUE上位8件と重複しない
- engagementなしはRescueしない
- work更新が30日以内ならRescueしない
- engagementが30日以内ならRescueしない
- 最大1件
- 既存CONTINUEの順番を変更しない
- 作品詳細を開く以外の管理操作を追加しない

## 13. LATER

- 30日閾値の実データ分布による再評価
- progress更新を明示的engagementとして記録する仕組み
- Rescueを閉じる / 今は見ない等の個別フィードバック
- media type別閾値

## 14. REJECTED

- `updated_at`だけでRescue
- engagement不明作品の積極的Rescue
- Rescue専用巨大セクション
- RETURN / RESCUEの2列常設
- 自動paused化
- resume score / AI推薦

## 15. Acceptance Criteria

- Rescue候補は通常CONTINUEの上位8件から除外される
- 30日未満のengagementは対象外
- 30日未満のwork updateは対象外
- engagementなしは対象外
- 候補が複数でも1件だけ
- 対象なしではUIを増やさない
- Mobileで通常CONTINUEカルーセルを壊さない
- CHOOSE / EXPLORE / REFLECTへ影響しない
- CI / local D1 migration / Worker dry-runが成功する
- production deploy成功を確認する
