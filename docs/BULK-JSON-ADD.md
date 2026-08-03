# JSONでまとめて追加

通常の「タイトルで追加」と分け、詳細情報を含むJSONを最大10作品ずつ追加するための機能です。

## 入口

- PC: 上部の「JSONで追加」
- モバイル: 通常の作品追加ダイアログ内「JSONでまとめて追加」

## 対応形式

### 作品配列

```json
[
  {
    "title": "作品名",
    "type": "book",
    "status": "want"
  }
]
```

### 作品体験ログの書き出しJSON

```json
{
  "works": [],
  "experiences": [],
  "notes": []
}
```

`works[].id`と、`experiences[].work_id`・`notes[].work_id`を照合し、新しく作成した作品IDへ結び直します。作品配列の各要素へ`experiences`・`notes`を直接入れる形にも対応します。

## 作品で取り込む項目

- title
- type
- status
- creator
- release_year
- rating
- short_note
- progress_current
- progress_total
- unit_label
- labels.genre / labels.theme / labels.tag
- metadata

元JSONのID、owner_id、version、作成・更新日時、deleted_at、visibilityは引き継ぎません。すべて新規の非公開作品として作成します。

## 安全策

- 1回最大10作品
- JSON解析前にコードブロックとBOMを除去
- 種別、状態、文字数、数値範囲、分類件数を事前確認
- JSON内の重複と、現在のライブラリにある同種別・同名作品を初期状態で除外
- 同名作品の追加は明示的に許可した場合のみ
- 作品作成は既存の`POST /api/works`を利用
- 体験とメモも既存APIを順番に利用
- 体験追加によって状態が変わった場合は、最後に元JSONの作品状態・評価・進捗へ戻す
- 作品本体の追加に失敗した項目だけを再試行用JSONとして残す
- 作品本体は追加済みだがメモ・体験の一部が失敗した場合は、再登録による重複を避けて別レポートにする

## 補足

大量データを移行する取込センターとは別機能です。日常的に数作品をまとめて追加する用途を想定しています。
