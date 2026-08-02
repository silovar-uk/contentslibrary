# ホーム自動抽選・カード内操作の実装計画

対象コミット: `03db205` 以降。ご要望5点を実装するための計画です。

## 結論

4本のPRに分けます。**PR-1を必ず最初に入れてください。** PR-2以降はPR-1が前提です。

| PR | 内容 | 対応するご要望 | 規模 |
| --- | --- | --- | --- |
| PR-1 | 作品を開く導線の修復と、開く経路の明示化 | 4・5 | 小 |
| PR-2 | カード構造の作り替えと5段階★評価 | 2 | 中 |
| PR-3 | カードからのメモ入力 | 3 | 小 |
| PR-4 | 起動時に5冊を自動で並べる | 1 | 小 |

---

## 調査で判明したこと

実装に入る前に、ブラウザで実際に動かして原因を確定させました。3点とも計画の前提になります。

### 発見1: ホームから作品を開けない原因は「読み込み失敗」ではない

詳細パネルの中身は**正しく読み込まれています**。ホームの「最近の作品」カードをクリックして計測したところ、
`#detailPanel` に `is-open` が付き、見出しにも作品名(「パラサイト 半地下の家族」)が入っていました。

見えない理由は配置です。`#detailPanel` は `<main class="library-view">` の内側(`public/index.html:176`)にあり、
`public/styles/app.css:130-131` により `app-shell[data-view="library"]` のときだけ表示されます。
`openDetail()`(`public/views/detail.js:11`)は `state.view` を切り替えないため、ホーム表示のままとなり、
パネルは `display:none` の領域内で開いて終わります(計測値: パネル幅 0px)。

同じ原因で動かない導線は次の4つです。

- 最近の読書メモ
- 最近の作品
- 現在読んでいる本
- ランダム抽選結果の「詳細を見る」

### 発見2: 一覧カードから詳細が開くのは、再描画のタイミング事故で成立している

**これが今回いちばん重要な発見です。**

`public/views/detail.js:346-347` には、一覧のカードを対象外にする意図のガードがあります。

```js
const workId = event.target.closest("[data-work-id]")?.dataset.workId;
if (workId && !event.target.closest("#workList")) { /* app:open-work を発火 */ }
```

ところが実際には、一覧のカードでもこのガードを素通りして発火します。理由は次のとおりです。

1. `public/views/library.js:317` の capture ハンドラが `selectWork()` を呼ぶ
2. `selectWork()` → `notify()` → `renderWorkList()` が `#workList.innerHTML` を丸ごと差し替える
3. document までバブルした時点で、クリックされたカードは DOM から切り離されている
4. 切り離されたノードでは `closest("#workList")` が `null` を返すため、ガードが成立しない

実測で確認しました。document のバブル段階で `event.target.isConnected` が `false`、
`closest('#workList')` が `false` になっています。

つまり「一覧から詳細が開く」という基本機能が、再描画のタイミングに依存した偶然で動いています。

**なぜ致命的か**: ご要望2・3でカード内に★ボタンやメモ入力を置くと、それらをクリックするたびに
同じ経路で `app:open-work` が発火し、**意図せず詳細パネルが開きます**。
カード内に操作を足す前に、この暗黙の経路を明示的なトリガーへ置き換える必要があります。

### 発見3: カードが `<button>` なので、中に操作要素を置けない

現在、次の4種類のカードはすべて `<button>` です。

| カード | 場所 |
| --- | --- |
| `work-card` | `public/views/library.js:58` |
| `reading-card` | `public/views/home.js:112` |
| `note-item` | `public/views/home.js:121` |
| `compact-item` | `public/views/home.js:125` |

HTMLの仕様上、`<button>` の中に `<button>` は置けません。パーサが親のボタンを閉じてしまうため、
★ボタンやメモの保存ボタンを入れると DOM構造が壊れます。
ご要望2・3を実現するには、カードを `<article>` に変え、開く操作を内側のボタンへ分離する必要があります。

---

## PR-1: 作品を開く導線の修復と、開く経路の明示化

ご要望4・5に対応し、同時にPR-2以降の前提を整えます。

### 変更1: `openDetail()` で表示を作品一覧へ切り替える

`public/views/detail.js:11` を次のようにします。

```js
export async function openDetail(id) {
  try {
    const data = await api(`/api/works/${encodeURIComponent(id)}`);
    state.selectedId = id;      // 一覧の aria-current を合わせる
    setSelectedDetail(data);
    setView("library");         // 詳細パネルが表示される領域へ切り替える
    $("#detailPanel").classList.add("is-open");
  } catch (e) { toast(e.message, "error"); }
}
```

`setView` を `../core/store.js` の import に追加します。
一覧から開いた場合は既に `library` なので、この呼び出しは無害です。

### 変更2: 開くトリガーを `data-open-work` に明示する

発見2の暗黙経路を廃止します。

- `public/views/detail.js:346-347` の「`[data-work-id]` かつ `#workList` 外なら開く」を削除する
- 代わりに `[data-open-work]` を持つ要素のクリックだけで `openDetail()` を呼ぶ
- `public/views/home.js` の3種類のカードと、`randomResultMarkup()` の「詳細を見る」に
  `data-open-work="<作品ID>"` を付ける
- `public/views/library.js:317` の capture ハンドラは、`selectWork()` だけでなく
  明示的に `openDetail(id)` を呼ぶようにする

`data-work-id` 属性自体は選択JSON書き出しが使っているため残します。

### 確認方法

1. ホームの「最近の読書メモ」「最近の作品」「現在読んでいる本」をクリックし、
   作品一覧へ切り替わったうえで右側に詳細が表示されること
2. ランダム抽選の「詳細を見る」でも同様に開くこと
3. 作品一覧のカードからこれまでどおり詳細が開くこと(事故依存でなく明示的に開くこと)
4. `grep -rn "closest(\"#workList\")" public/` が0件になること

---

## PR-2: カード構造の作り替えと5段階★評価

ご要望2に対応します。「いちいち詳細に入らなくても★を付けられる」状態にします。

### サーバー側の変更はありません

`PATCH /api/works/:id/preferences`(`src/routes/work-preference-v131.ts:49`)が既に
1〜5の整数評価を受け付けます。スナップショットは `version` を含むため、楽観ロックもクライアント側で成立します。

### 変更1: `work-card` を `<article>` へ作り替える

```html
<article class="work-card" data-work-id="...">
  <button type="button" class="work-card-main" data-open-work="...">
    …既存のカード内容(種別・状態・タイトル・作者・一言メモ・ラベル・進捗)…
  </button>
  <div class="work-card-tools">
    …★1〜5と「未評価」ボタン…
  </div>
</article>
```

- CSS: 現在 `.work-card` に当たっている枠線・背景・角丸・padding(`app.css:174`)を容器側に残し、
  `.work-card-main` は背景と枠線を持たない全幅のボタンにします
- 選択モード: 現在 `.work-card` に付けている `aria-pressed` と `is-selected` を
  `.work-card-main` 側へ移し、`public/views/library.js:317` のセレクタも合わせます

### 変更2: ★のクリック処理

```js
const work = state.works.get(id);
const data = await api(`/api/works/${encodeURIComponent(id)}/preferences`, {
  method: "PATCH",
  body: JSON.stringify({ version: Number(work.version), rating })
});
upsertWork(data.work);
```

**注意点を2つ挙げます。**

1. **`setSelectedDetail()` を呼ばないこと。** 詳細パネル用の `updatePreference()`
   (`public/views/detail.js:180`)はこれを呼びますが、一覧の★では選択中でない作品の詳細を
   上書きしてしまいます。`upsertWork()` だけを使います。
2. **409(バージョン競合)の扱い。** 別画面で更新されていると409が返ります。
   `loadSnapshot()` で取り直したうえで、やり直しを促すトーストを出します。

### 要判断: ★を出す場所

作品一覧のカードを対象とします。ホームの「現在読んでいる本」カードにも出すかは、
画面が賑やかになるため分けて判断したいところです。指示をください。

### 確認方法

1. 一覧のカードで★をクリックし、詳細を開かずに評価が変わること
2. **★をクリックしても詳細パネルが勝手に開かないこと**(発見2の回帰確認)
3. 評価順の並び替えに、クリックした結果が反映されること
4. 選択してJSON書き出しのモードが従来どおり動くこと

---

## PR-3: カードからのメモ入力

ご要望3に対応します。PR-2でカードが `<article>` になった後に着手します。

### 設計判断: 入力欄は既定で閉じておきます

全カードに入力欄を常時表示すると、作品数だけ入力欄が並んで一覧が読めなくなります。
カードに「メモ」ボタンを置き、押した作品だけ1行入力欄を開く形にします。

### 変更内容

- `POST /api/works/:id/notes` に `{ note_type: "quick", content }` を送ります(サーバー変更なし)
- 保存後は `upsertWork({ ...work, has_notes: true })` でメモありフラグを更新し、トーストを出します
- **開閉状態はモジュール変数の `Set<workId>` で保持します。** 保存すると `renderWorkList()` が走って
  入力欄が閉じてしまうため、ジャンル棚の `shelfExpanded` と同じ作法で再描画後も状態を維持します

### 確認方法

1. カードの「メモ」から入力し、詳細を開かずに保存できること
2. 保存後、その作品を詳細で開くとメモが入っていること
3. 「メモがある作品のみ」の絞り込みに、保存した作品が現れること
4. 保存後も入力欄の開閉状態が保たれること

---

## PR-4: 起動時に5冊を自動で並べる

ご要望1に対応します。ファーストビューのヒーロー部分を作り替えます。

### 設計判断: サーバーではなくクライアントで抽選します

全作品がメモリに常駐しているため(`public/core/store.js:5` の設計方針)、
ジャンル棚・テーマ棚と同じくクライアント側で選べます。起動時のAPI往復が増えず、待ち時間がゼロになります。

### 変更内容

- `public/core/store.js` に `pickRandomWorks(scope, count, excludeIds)` を追加します。
  対象条件は現行の抽選APIに合わせ、既定は「本」かつ「所持・未読または読みたい」とします
- ヒーローの `#randomStage` を、1件表示から5枚のカード列へ変えます
- 初期表示で自動的に抽選します。既存の `RANDOM_HISTORY_KEY`(localStorage)を流用し、直近に出た作品を避けます
- 「本を引く」ボタンは「引き直す」として残します

**実装上の注意**: 選んだ5冊のIDはモジュール変数に保持し、再描画はそこから行ってください。
`subscribe()` に抽選そのものを繋ぐと、★を1回押すたびに5冊が入れ替わってしまいます。
抽選をやり直すのは、初回読み込みと「引き直す」を押したときだけにします。

### 既存テストへの影響

`test/editorial-ui-random-v14.test.js` がヒーローのマークアップを検証しています。
次の4点を維持すれば、テストを修正せずに済みます。

- 見出しの「次に読むものを」
- 抽選する棚の選択肢(「所持・未読＋読みたい」)
- `data-action="draw-random"` を持つボタン
- カード内の「読み始める」ボタン

### 副作用: `/api/random-work` が未使用になります

クライアント側で抽選するため、`src/routes/random-v14.ts` は呼ばれなくなります。
今回のご要望の範囲外なので**ルートは削除せず残します**。削除するかどうかは別途ご判断ください。

### 確認方法

1. ホームを開いた直後に、操作なしで5冊が並ぶこと
2. 「引き直す」で別の5冊に入れ替わること
3. 対象作品が5冊未満のときに、あるだけ表示して例外が出ないこと
4. 対象作品が0件のときに、空表示の案内が出ること
5. ★を押しても5冊の顔ぶれが変わらないこと

---

## 実装順序

1. **PR-1**(必須の前提)。導線を直し、カード内に操作を置ける土台を作ります
2. **PR-2**。カード構造を変え、★を載せます
3. **PR-3**。PR-2の構造の上にメモ入力を載せます
4. **PR-4**。他と独立しているため、PR-1の後ならいつでも入れられます

PR-2の途中で止まると、カード構造だけ変わって操作が載っていない状態になります。
PR-2とPR-3はまとめて1度に確認したほうが安全です。

## 要判断事項

1. ★をホームの「現在読んでいる本」カードにも出すか(既定案: 作品一覧のみ)
2. メモ入力を既定で閉じておく案でよいか(既定案: 「メモ」ボタンで開く)
3. 未使用になる `/api/random-work` を残すか削除するか(既定案: 残す)
