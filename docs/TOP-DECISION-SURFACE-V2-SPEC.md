# TOP Decision Surface v2 仕様

対象: Contents Library TOP

## 1. 目的

TOPを情報一覧ではなく「次の一手を決める面」として統一する。

- CONTINUE: いま進めている作品へ戻る
- CHOOSE: 次候補の優先度を決める
- EXPLORE: まだ候補に入っていない作品を興味から探す
- REFLECT: 最近の記録から振り返る

便利さを最優先し、管理操作・評価・メモ入力をTOPの主目的から外す。

## 2. 守破離

### 守

- CONTINUE / CHOOSE / EXPLORE / REFLECT の4ゾーン構造
- CHOOSEのFeatured Shelf感
- ランダム候補は再描画のたびに引き直さない
- 既存の `metadata.reading_priority`
- ジャンルからLibraryへ遷移する導線

### 破

- CONTINUEだけ従来の3列カード文法で表示する構造
- CHOOSE内の「読み始める」から直接 `active` へ変更する操作
- CHOOSEカード内の評価・メモ操作
- ジャンル棚を `max-height` で切り、展開しないと全体像が分からない構造
- スマホで次カードを70vw幅で半端に見せるスクロールヒント

### 離

TOPを時間軸のDecision Surfaceとして読む。

- NOW = CONTINUE
- NEXT = CHOOSE
- MAYBE = EXPLORE
- PAST = REFLECT

ただし画面上でNOW/NEXT等を強制表示する必要はなく、情報構造として利用する。

## 3. MUST

### CONTINUE

- CHOOSEと同じFeatured Shelf文法を共有する
- PCでは最大6件を1段の視界に置き、7件目以降は横方向へ続ける
- Tabletではカード幅を維持して横スクロールする
- Mobileではカードを1枚単位でスナップし、半端に切れたカードを見せない
- カード全体の主操作は作品詳細を開くこと
- 最終更新日を再開判断の補助情報として表示する
- 評価操作はTOP上では表示しない

### CHOOSE

- ランダム抽選機能は維持する
- 「読み始める」を廃止する
- 未読の本・漫画では既存の読む優先度をその場で変更できる
- 優先度変更は `status` を変更しない
- 優先度変更後も候補の顔ぶれと順番を勝手に変えない
- 評価・メモ操作をカードから外す
- 作品詳細を開く操作は維持する

### EXPLORE / ジャンル

- ジャンルは常時すべて表示する
- `max-height` / overflow hidden / 「ほかの棚も見る」をジャンルでは使わない
- 主要ジャンルと小ジャンルを同じ一覧文法で見せる
- 可変幅カードではなく等幅の自動折返しグリッドを基本とする
- サマリーにジャンル数を表示する
- 未分類も1つの棚として全体数に含める
- テーマ棚は従来の展開方式を維持する

### Mobile

- CONTINUE / CHOOSE とも1カード単位の横スワイプ
- 次カードの一部を見せて続きの存在を示す方法は使わない
- 代わりに「横にスワイプ →」を明示する
- ジャンルは横スクロールではなく全件を2列程度で縦に把握できる

## 4. SHOULD

- CONTINUEとCHOOSEのカード角丸・余白・背景・見出しリズムを共通化する
- CONTINUEでは進捗バーを維持し、再開判断の補助とする
- 優先度変更成功時はCHOOSE内だけ短いフィードバックを出す
- 優先度設定UIは既存のcompact details surfaceを再利用する

## 5. LATER

- book/manga以外にも「次に触れる優先度」を一般化するか検討
- CONTINUEの先頭候補を進捗・最終更新などから推薦する仕組み
- Carouselの現在位置カウンタ
- REFLECTの情報密度再設計

## 6. 状態遷移

### CHOOSE

`want / owned_unread` -> reading_priority変更 -> statusは維持

実際に開始する操作は詳細画面等の既存導線へ委ねる。
開始後 `active` になれば、次回Homeデータ取得時にCONTINUEへ現れる。

### CONTINUE

`active` の作品だけを表示する。
TOPではstatus変更を主操作にしない。

## 7. Empty / Loading / Error

- CONTINUEが0件ならZone自体を隠す既存仕様を維持
- CHOOSE候補0件ならZone自体を隠す既存仕様を維持
- EXPLORE / REFLECTは常に残す
- ジャンル0件は既存empty stateを表示
- 優先度保存失敗時はtoastで明示し、操作ボタンを再有効化

## 8. 非機能要件

- randomPickIdsをstate更新時に再抽選しない
- MutationObserverを新規追加しない
- 既存Observerの責務を増やす場合はループを発生させない
- DB migration不要
- `reading_priority` の既存データ構造を維持
- keyboard / focus-visibleを既存水準以上に保つ
- mobile tap targetは既存reading priority surfaceの30px以上を維持

## 9. 実装方針

主な変更候補:

- `public/views/home.js`
- `public/views/home-composition.js`
- `public/views/reading-priority-surfaces.js`
- `public/views/reading-priority.js`
- `public/styles/home-decision-surface.css`
- `public/styles/editorial-home.css`
- 関連テスト

既存モジュールを増やさず、現在のHome Composition / Editorial Home / Reading Priority責務の中で完結させる。

## 10. Acceptance Criteria

- [ ] CONTINUEとCHOOSEが同じFeatured Shelf系統に見える
- [ ] CONTINUEとCHOOSEの目的は混同しない
- [ ] CHOOSEに「読み始める」が存在しない
- [ ] CHOOSEで未読book/mangaの優先度を変更できる
- [ ] 優先度変更でstatusがactiveにならない
- [ ] 優先度変更でrandom候補が引き直されない
- [ ] CHOOSEに評価・メモ操作がない
- [ ] ジャンルが展開操作なしで全件見える
- [ ] ジャンル数がサマリーで分かる
- [ ] MobileでCONTINUE / CHOOSEのカードが半端に切れない
- [ ] Mobileで横スワイプ可能であることが文言で分かる
- [ ] テーマ棚の既存展開機能は壊れない
- [ ] 全CI・dry-runが成功する
