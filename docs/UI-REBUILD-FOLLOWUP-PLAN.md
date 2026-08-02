# UI再構築の積み残し・実装計画

対象コミット: `35c0fd4`(UIを一枚屋根に再構築し、検索の連鎖再描画を解消する)以降。
このドキュメントは、再構築で入った退行の修復と、当初からの積み残し2件の扱いをまとめたものです。

## 結論

作業は2本のPRに分けます。

| PR | 内容 | 規模 | 前提 |
| --- | --- | --- | --- |
| PR-A | 再構築で入った退行4件の修復 | 小(純減寄り) | なし。先に単独で入れる |
| PR-B | テーマ横断ブラウズ | 中 | PR-A適用後 |
| 見送り | 関連作品(`work_relations`)表示 | — | 運用意思の確認待ち |

PR-Aは機能欠落の修復であり、PR-Bとは独立しています。先に切って入れてください。

---

## PR-A: 退行の修復

### A-1. 体験記録を新規追加できない(最優先)

**現象**
作品詳細パネルから体験記録を新規追加する手段が存在しません。既存の体験記録の編集・削除はできますが、
1件も体験記録がない作品では「まだ体験記録がありません。」と表示されるだけで、そこから先へ進めません。

**原因**
`public/views/detail.js:351` に `data-action='add-experience'` のクリックハンドラは残っていますが、
その属性を持つ要素をどこも描画していません。再構築前は `public/app-v02.js:213`(コミット`35c0fd4`で削除)の
`.detail-actions` 行にボタンがありました。メモ側は `inlineNoteFormMarkup()` によるインライン入力へ置き換えましたが、
体験側は代替を用意しないまま旧ボタンだけが消えた状態です。

**修正**
`experiencesMarkup()`(`public/views/detail.js:56`)の見出し行にボタンを追加します。
`.detail-actions` 行ではなく体験履歴セクションに置くのは、体験0件時の空表示のすぐ上に導線が来るためです。

```js
return `<div class="section-heading-row"><h3>体験履歴</h3>
    <div class="section-heading-tools">
      <button type="button" class="text-button" data-action="add-experience">＋ 体験を追加</button>
      <label>並び順<select id="experienceSortSelect">…既存のまま…</select></label>
    </div>
  </div>
  …以下既存のまま…`;
```

`public/styles/app.css` に1行追加します。

```css
.section-heading-tools{display:flex;align-items:center;gap:10px}
```

ハンドラ(`detail.js:351`)と `openExperienceDialog()`(`public/views/dialogs.js:198`)は既存のまま使えます。変更不要です。

**確認方法**
1. 体験記録が0件の作品を開き、「＋ 体験を追加」から保存できること。タイムラインに「1回目」が出ること。
2. 既存の体験記録がある作品で追加し、`sequence` が連番で増えること。
3. 保存後に評価の変化(`experienceSummary()`)が更新されること。

### A-2. `E` キーショートカットの欠落

**現象**
作品を選択した状態で `E` を押しても何も起きません。旧実装ではクイック編集の開閉(デスクトップ)、
または作品編集ダイアログ(モバイル)が開きました。

**原因**
再構築時に `public/app.js:35-44` へ移したキーバインドが `Ctrl/⌘+K`・`Ctrl/⌘+Enter`・`N`・`Escape` のみで、
旧 `public/app-v02.js:486` にあった `E` の分岐が漏れています。

**修正**
`public/app.js` の `keydown` ハンドラに1分岐を追加します。

```js
if (!typing && !event.metaKey && !event.ctrlKey && event.key.toLowerCase() === "e" && state.selected) {
  event.preventDefault();
  if (matchMedia("(min-width:1200px)").matches) toggleQuickEdit();
  else openWorkDialog(true);
}
```

`public/app.js:4` の import に `toggleQuickEdit` を追加します。`openWorkDialog` は import 済みです。
旧実装は `state.quickEditOpen` を直接書き換えて `renderDetail()` を呼んでいましたが、
新実装では `toggleQuickEdit()` が `notify()` を通じて再描画するため、そちらへ差し替えます。

**確認方法**
1. デスクトップ幅(1200px以上)で作品を選択し、`E` でクイック編集が開閉すること。
2. モバイル幅で `E` を押すと作品編集ダイアログが開くこと。
3. 検索欄やテキストエリアに入力中は `E` が文字入力として扱われること(`typing` ガードの確認)。

### A-3 / A-4. `app:apply-preset` の受け手が空実装

**現象**
以下の2つの導線が無反応です。

- モバイル下部ナビの「記録」タブ(`public/index.html:204`)
- ホーム「現在読んでいる本」の「すべて見る →」(`public/index.html:79`)

**原因**
送信側2箇所(`public/app.js:31` と `public/views/home.js:200-202`)が `app:apply-preset` を投げますが、
受け手(`public/app.js:65-68`)は `app:noop` を投げ返すだけの空実装です。
一方で同等の処理は `public/views/library.js:341-353` の `data-preset` ハンドラに既に実装済みです。

**修正方針**
カスタムイベントを1本増やすのではなく、既存の `data-preset` 経路へ寄せます。差分は純減になります。

| ファイル | 変更 |
| --- | --- |
| `public/index.html:79` | `data-action="show-reading"` → `data-preset="reading"` |
| `public/index.html:204` | `data-mobile-view="records"` → `data-preset="completed"` |
| `public/views/home.js:200-202` | `show-reading` の分岐を削除 |
| `public/app.js:31` | `mobile === "records"` の分岐を削除 |
| `public/app.js:65-68` | `app:apply-preset` リスナーを削除 |

`data-preset` ハンドラは内部で `setView("library")` まで行うため、モバイルでも画面遷移します。
`public/views/library.js:366` が参照する `[data-mobile-view='library']` は変更しないため、ジャンル棚からの遷移は影響を受けません。
`.mobile-nav button` のスタイルは属性に依存していないため、見た目も変わりません。

**要判断: 「記録」タブの中身**
削除する空実装のコメントには「完了・停止をまとめて見る導線」とあります。
ただし絞り込みUIの `#filterStatus` は単一selectで、`syncControlsFromState()`(`library.js:11`)は
`state.filters.statuses[0]` しか反映しません。複数statusのプリセットを入れると、
selectの表示・アクティブフィルタチップ(`renderActiveFilters()`)と実際の結果件数がずれます。

**推奨**: 「記録」タブは `completed` 単独にします(既存プリセットの再利用で、追加コードは0行)。
完了と停止をまとめたい場合は、別途以下の3点が必要です。着手前に指示をください。

1. `#filterStatus` に複合値のoptionを追加する
2. `readControlsIntoFilters()` で値をカンマ分割する
3. `renderActiveFilters()` / `clearChipByText()` を複数statusに対応させる

**確認方法**
1. モバイル幅で「記録」タブを押すと、一覧が完了作品だけに絞られて表示されること。
2. ホームの「すべて見る →」で、本かつ進行中の一覧が表示されること。
3. 遷移後にアクティブフィルタチップの表示と結果件数が一致すること。

### A-5. 併せて削除する死んだコード

`public/views/detail.js:350` の `data-action='add-note'` ハンドラは、対応する要素がどこにもありません。
メモ追加はインライン入力(`inlineNoteFormMarkup()`)へ置き換わっているため、この1行を削除します。
`openNoteDialog()` はメモ編集(`data-edit-note`)から呼ばれるため、関数自体は残します。

---

## PR-B: テーマ横断ブラウズ

### 設計判断

**新規のトップレベル画面ではなく、ホームにセクションを追加します。**
理由は、専用画面にすると `applyView()` の分岐・ナビゲーション項目・`hidden` 制御が増える一方で、
得られる体験は既存のジャンル棚と同じだからです。ジャンル棚の直下にテーマ棚を置けば、
「棚を眺めて選ぶ」という同じ操作感のまま横断できます。専用画面が必要な場合は指示をください。

**`label` フィルタの流用ではなく、`theme` 専用フィルタを新設します。**
既存の `filters.label`(`store.js:135-141`)は genre・theme・tag を横断した部分一致です。
これを流用すると、テーマ「心理」がジャンル「心理・認知」にも一致し、
棚のチップに出る件数と遷移後の一覧件数がずれます。完全一致の専用フィールドにすれば数が一致します。

### 変更内容

**サーバー側の変更はありません。** `/api/library/snapshot`(`src/routes/library-snapshot.ts:30`)が
既に `labels.theme` を返しており、フロントは全件常駐しているため、追加のAPIは不要です。

#### 1. `public/core/store.js`

- `state.filters` と `clearFilters()` の初期値に `theme: ""` を追加します(2箇所)。
- `matchesFilters()` に完全一致の判定を追加します。

```js
if (filters.theme && !(work.labels?.theme || []).includes(filters.theme)) return false;
```

- `themeData()` を追加します。`shelfData()` と同じ `SHELF_SCOPE_PREDICATE` を使い回します。
  ジャンルは先頭1件のみを見ますが、テーマは1作品が複数持つ前提で全件をカウントします。

```js
export function themeData(scope = "all") {
  const predicate = SHELF_SCOPE_PREDICATE[scope] || SHELF_SCOPE_PREDICATE.all;
  const counts = new Map();
  for (const work of allWorks().filter(predicate)) {
    for (const name of work.labels?.theme || []) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return Array.from(counts, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
```

#### 2. `public/views/library.js`

- `themeNavigate(name)` を export します。`shelfNavigateToGenre()`(`library.js:362`)と同じ構造です。

```js
export function themeNavigate(name) {
  clearStoreFilters();
  setFilters({ theme: name });
  syncControlsFromState();
  setView("library");
}
```

- `renderActiveFilters()` にチップを追加します: `if (f.theme) chips.push(\`テーマ：${f.theme}\`)`
- `clearChipByText()` に解除の分岐を追加します: `if (text.startsWith("テーマ：")) { setFilters({ theme: "" }); return; }`
  `label` の判定(`分類：`)より前に置いてください。前方一致の順序に依存します。

#### 3. `public/views/home.js`

- `renderThemeShelf()` を追加し、`renderHome()` から呼びます。`subscribe(renderThemeShelf)` も `initHome()` に追加します。
- 表示は上位12件、残りは既存の `shelfExpanded` と同じ作法で「ほかのテーマも見る」で展開します。
- クリックで `themeNavigate(name)` を呼びます。ジャンル棚の `data-genre-id` と衝突しないよう、属性は `data-theme-name` にします。

#### 4. `public/index.html`

`#genreShelf` セクションの直後に `<section id="themeShelf">` を追加します。
棚スコープタブ(すべて/未読/進行中/完了/お気に入り)はジャンル棚と共有せず、初版は全作品固定にします。

#### 5. `public/styles/app.css`

テーマチップの行スタイルを追加します(8行程度)。件数バッジ付きのpillを `flex-wrap` で並べるだけです。

#### 6. `test/theme-shelf.test.js`

以下の2点を確認します。

1. 複数テーマを持つ作品が、それぞれのテーマで1件ずつカウントされること
2. `filters.theme = "心理"` が完全一致で、ジャンル「心理・認知」の作品を拾わないこと

### 確認方法

1. ホームにテーマ棚が出て、件数の合計が実データと一致すること
2. チップをクリックすると一覧がそのテーマに絞られ、件数がチップの数字と一致すること
3. チップの「×」でテーマ絞り込みが解除されること
4. テーマが1件も設定されていない状態で、棚が空表示になり例外が出ないこと

---

## 見送り: 関連作品(`work_relations`)

**現状**
`migrations/0001_initial.sql:109` にテーブルがあり、`src/routes/works.ts:197-200` の `getWork()` が
`relations` を返しています。しかし**書き込み経路がリポジトリ内に一つも存在しません**。
INSERT を行うコードがないため、`relations` は常に空配列です。表示UIだけを作っても永久に空のままです。

**着手する場合に必要なもの(3点セット)**

1. 登録・削除API: `POST` / `DELETE` `/api/works/:id/relations`
2. 詳細パネルの関連作品セクションと、作品を検索して結びつけるUI
3. 双方向の扱いの決定(A→Bを張ったときB→Aも作るか、片方向のまま逆引き表示にするか)

**再開条件**
「対になる本」を実際に運用する意思が固まったときです。それまでは着手しません。

---

## 実装順序と受け入れ基準

1. PR-A を実装し、A-1〜A-4 の確認方法をすべて通す
2. PR-A をデプロイして実データで確認する
3. PR-B を実装し、確認方法をすべて通す

**PR-Aの受け入れ基準**

- [ ] 体験記録が0件の作品から、体験記録を新規追加できる
- [ ] `E` キーでクイック編集(デスクトップ)/作品編集(モバイル)が開く
- [ ] モバイルの「記録」タブが一覧を絞り込んで表示する
- [ ] ホームの「すべて見る →」が一覧を絞り込んで表示する
- [ ] `grep -rn "app:apply-preset\|app:noop" public/` が0件になる
- [ ] 既存テスト(`npm test`)が通る

**PR-Bの受け入れ基準**

- [ ] ホームのテーマ棚から一覧へ遷移でき、件数が一致する
- [ ] `test/theme-shelf.test.js` が通る
- [ ] 既存のジャンル棚の挙動が変わっていない

## 要判断事項

1. 「記録」タブの中身を `completed` 単独にしてよいか(推奨)。完了・停止をまとめる場合は絞り込みUI側の対応が追加で必要です
2. テーマ横断をホームのセクションで進めてよいか。専用画面が必要な場合は指示をください
3. 関連作品は見送りでよいか
