# Contents Library — Home Decision Surface 再設計計画

更新日: 2026-09-07

## 0. この文書の目的

この文書は、Contents Library のホーム画面を「機能を並べるダッシュボード」から「次に何をするかを決める Decision Surface」へ再設計するための、実装前の設計基準である。

今回は UI 実装を行わない。先に以下を固定する。

1. 現在のホームに存在する全責務の棚卸し
2. 責務の重複と衝突の整理
3. 理想的な情報アーキテクチャ
4. PC / mobile の文章ワイヤー
5. 状態別の表示ルール
6. Home Composition の実装責務
7. 段階的な移行計画と却下条件

---

# 1. ホームの最上位目的

ホームの目的は「自分のライブラリの状態を説明すること」ではない。

**今、どの作品に戻るかを決めること。**

そのために、ホームで答える問いを3つに限定する。

1. 続けるものはあるか
2. なければ次に何を選ぶか
3. まだ決まらなければ何から探すか

この3問に直接寄与しない情報は、ホームでは弱くするか Library / Detail 側へ移す。

---

# 2. 現在のホーム責務マップ

現在は、静的HTMLだけでなく複数の JavaScript モジュールがセクションを追加・移動している。

## 2.1 Hero / Random Featured

責務: **CHOOSE / 偶然から次を選ぶ**

主な実装:

- `public/index.html`
- `public/views/home.js`
- `public/views/editorial-home.js`
- `public/views/home-experience.js`

現在の特徴:

- 6作品をランダム抽選
- Featuredカードとして表示
- 表紙・ジャンル・作者・状態・評価・メモ・開始導線を持つ
- PCでは6件1段、狭い幅では横スクロール

評価:

- Contents Library の個性として残す
- 「推薦」ではなく「偶然を作る装置」と定義する

---

## 2.2 Reading Priority Home Hub

責務: **MANAGE / 優先順位を管理する**

主な実装:

- `public/views/reading-priority-surfaces.js`

現在の特徴:

- 最優先 / 高 / 中 / 低 / 未設定の件数表示
- 「読む順番を整理」導線
- `random-controls` 後に生成された後、editorial-home により randomStage 後へ移動される

評価:

- 機能自体は価値がある
- ただし「ホームで次を決める」より「ライブラリを管理する」性格が強い
- 将来的には独立した大きなホームセクションから降格させる
- Priority は表示する情報ではなく、CONTINUE / CHOOSE の並び順を助けるロジックに近づける

---

## 2.3 Wallet Stacks

責務: **CHOOSE + MANAGE の混在**

主な実装:

- `public/views/wallet-stacks.js`

現在の3束:

- 最優先
- 積読
- 読みたい

現在の特徴:

- Priority Hub の後ろへ動的挿入
- 表紙の束として視覚的に見せる
- 展開 / Libraryへの遷移が可能

評価:

- 視覚的な棚体験として魅力はある
- ただし「最優先」は Reading Priority と重複
- 「積読」「読みたい」は Featured の抽選母集団とも重複
- ホームに独立した大ブロックとして置く必然性を再検討する

第一候補:

- Home上位からは外す
- EXPLOREの補助導線またはLibraryの棚ビューとして再配置
- 少なくとも Priority Hub / Featured と3連続で競合させない

---

## 2.4 Recently Edited Books

責務: **REFLECT / 管理上の最近**

主な実装:

- `public/views/home-experience.js`

現在の特徴:

- 最近更新した本を5冊
- randomStage 後へ動的挿入

評価:

- 「更新した」というデータ管理上の新しさと「次に触れるべき」が一致しない
- ホームの意思決定には弱い

第一候補:

- Homeから外す
- Libraryの「更新が新しい順」に責務を戻す

---

## 2.5 Genre Shelf / Theme Shelf

責務: **EXPLORE / 興味から探す**

主な実装:

- `public/index.html`
- `public/views/home.js`
- `public/views/editorial-home.js`

現在の特徴:

- editorial-home が2領域を `editorialExploreGrid` にまとめる
- ジャンルとテーマで別の探索軸を提供

評価:

- 残す
- ただし「ジャンル機能」「テーマ機能」ではなく一つの EXPLORE 領域として扱う
- mobileでは2セクション縦積みではなく切替も候補

---

## 2.6 Current Reading / Reading Strip

責務: **CONTINUE / 既に始めた作品へ戻る**

主な実装:

- `public/index.html`
- `public/views/home.js`
- `public/views/editorial-home.js`

現在の特徴:

- active作品を最大数件表示
- 現在のDOMでは Explore より後ろに位置する

評価:

- 今回の再設計で最重要
- 進行中作品が存在する場合、ホーム最上位へ上げる
- セクション名も状態説明ではなく「続きを進める」に変更する方向

---

## 2.7 Recent Notes / Recent Other / Stats

責務: **REFLECT / 振り返る**

主な実装:

- `public/index.html`
- `public/views/home.js`
- `public/views/editorial-home.js`

評価:

- Recent Notes は残す価値が高い
- Recent Other は補助
- Stats は最下層
- Above the Fold では競争させない

---

## 2.8 Security Banner

責務: **SYSTEM EXCEPTION / 要対応通知**

評価:

- CONTINUE / CHOOSE / EXPLORE / REFLECT の4分類には入れない
- 緊急性がある場合のみ、通常の情報階層を上書きできる例外領域とする
- 常設セクションとして場所を取らない

---

# 3. 現状の構造的問題

## 問題A: CHOOSEが3系統ある

現在、次候補を決めるための大きな仕組みが少なくとも3つある。

- Featured Random
- Reading Priority Hub
- Wallet Stacks

それぞれ単体では成立しているが、連続表示されるとユーザーは「どれを使って選べばいいか」を判断する必要がある。

ホームが意思決定を助ける前に、意思決定方式を選ばせてしまっている。

---

## 問題B: CONTINUEが低すぎる

すでに始めた作品は最も次の行動に近いのに、現状では Random / Priority / Wallet / Recently Edited / Explore の後ろへ下がりうる。

「新しいものを探す」導線が「既に始めたものへ戻る」より強くなっている。

---

## 問題C: Home Composition の責任者がいない

現在は各モジュールがそれぞれ以下を行う。

- DOM生成
- 特定要素の前後へ挿入
- 後続モジュールが再度移動
- MutationObserverで再適用

これは局所改善には便利だが、ホーム全体の順番を設計する段階では不安定になる。

**どのセクションをどこへ置くかを1つのモジュールが所有すべき。**

---

# 4. 新しいホームの分類

ホームに表示するものを、原則4種類へ制限する。

## CONTINUE

始めたものに戻る。

例:

- 読書中
- 視聴中
- 進行中

## CHOOSE

まだ始めていない候補から次を決める。

例:

- Featured Random

## EXPLORE

対象を決めず興味から探す。

例:

- Genre
- Theme

## REFLECT

過去の体験を振り返る。

例:

- Recent Notes
- Recent Works
- Stats

管理操作はこの4分類から原則外し、Library / Detailへ寄せる。

---

# 5. 基本優先順位

通常状態では以下を原則とする。

1. CONTINUE
2. CHOOSE
3. EXPLORE
4. REFLECT

考え方:

**Open loops before new loops.**

既に始めた体験を、新しい体験より少しだけ先に置く。

---

# 6. State-aware Home

ホーム順序を完全固定しない。

## State A: active作品あり

順序:

1. CONTINUE
2. CHOOSE
3. EXPLORE
4. REFLECT

最初に答える問い:

> 続きをやる？

---

## State B: active作品なし

順序:

1. CHOOSE
2. EXPLORE
3. REFLECT

空のContinueブロックを上部に残さない。

最初に答える問い:

> 次は何にする？

---

## State C: random候補不足

CHOOSEを空カードで大きく残さない。

- 候補が1〜5件なら存在する件数だけ表示
- 0件なら EXPLORE を上げる
- 「作品を追加する」「Libraryへ」の補助導線は小さく出す

---

## State D: データほぼ空

通常ホームの縮小版にはしない。

最優先:

1. 作品を追加する
2. Libraryを作る
3. Featured等は十分な候補が揃ってから意味を持たせる

---

# 7. 理想DOM — 概念構造

将来のホームは、機能名ではなく役割名で領域を持つ。

```html
<section id="homeView">
  <header class="home-intro">...</header>

  <div data-home-zone="system"></div>

  <main class="home-decision-flow">
    <section data-home-zone="continue"></section>
    <section data-home-zone="choose"></section>
    <section data-home-zone="explore"></section>
    <section data-home-zone="reflect"></section>
  </main>
</section>
```

実際のタグ名・IDは実装時に調整してよい。

重要なのは以下。

- Home Composition がゾーン順を所有する
- Featureモジュールは自分の内容だけ描画する
- Feature側が兄弟セクションの位置を勝手に決めない

---

# 8. 機能 → 新しい配置

## CONTINUE

含む:

- 現在読んでいる / 視聴中 / 進行中
- Priority情報は必要に応じてカード順位に利用

含めない:

- Priority件数ダッシュボード

---

## CHOOSE

含む:

- Random Featured 6件
- 抽選Scope
- 引き直す

必要なら小さな補助リンク:

- 「読む順番を整理」

ただし Priority Hub 全体は置かない。

---

## EXPLORE

含む:

- Genre Shelf
- Theme Shelf

Wallet Stacks を残す場合は、この領域の補助候補としてのみ再評価する。

ただし「最優先」Stackは Priority と重複するためそのまま移植しない。

---

## REFLECT

含む:

- Recent Notes
- Recent Other
- Stats

Recently Edited Books は第一候補としてHomeから削除。

---

# 9. Reading Priority の新しい扱い

Priority は「ホームの一セクション」から「意思決定を助けるメタデータ」へ役割変更する。

## Home

- Continue内の並び順
- 必要ならタイトル付近の小さなラベル
- 「読む順番を整理 →」程度の補助導線

## Library

- 優先度別フィルター
- 読む順番整理
- 件数確認

## Detail

- 優先度設定・変更

これにより Priority は消えない。

**ホームでの存在感だけを適切にする。**

---

# 10. Wallet Stacks の新しい扱い

Wallet Stacks は魅力的な視覚表現だが、現在の3分類は他機能と責務が重なる。

## 現行

- 最優先 → Priority と重複
- 積読 → Featuredの候補群と重複
- 読みたい → Featuredの候補群と重複

## 第一候補

Home上位から外す。

## 第二候補

EXPLOREの中に「棚を見る」モードとして残す。

例:

- ジャンル
- テーマ
- 本の束

ただしPhase 1では統合せず、一度Home上位から外して必要性を再評価する。

---

# 11. PC文章ワイヤー

進行中作品がある状態を基準とする。

## Header / Intro

大きな説明Heroは縮小候補。

役割:

- Contents Library の人格を示す
- 主行動を邪魔しない

---

## 01 — CONTINUE

見出し:

**続きを進める**

補助:

> いま開いている作品へ戻る。

表示:

- 最大3件
- 横3カード
- タイトル / 進捗 / 優先度 / 主CTA
- 評価など管理操作は静かに

---

## 02 — CHOOSE

見出し:

**次の作品を、棚から引く。**

補助:

> 自分では選ばなかった作品に、偶然戻ってみる。

表示:

- Featured 6件
- PC広幅は6列1段
- 狭PCは1段横スクロール
- Scope / 引き直す

---

## 03 — EXPLORE

見出し:

**興味から探す**

PC:

- 左: ジャンル
- 右: テーマ

一つの背景・一つのセクション見出しで「探索」という同一目的を示す。

---

## 04 — REFLECT

見出し:

**最近の記録**

2カラム:

- 最近のメモ
- 最近の作品

Statsはこの後ろに弱く表示。

---

# 12. Mobile文章ワイヤー

MobileはPCの縦積み版にしない。

## First View

主行動は最大2種類。

進行中あり:

1. 続きを進める
2. 棚から引く

進行中なし:

1. 棚から引く
2. 興味から探す

---

## CONTINUE

- 横スワイプ
- 1枚を大きく見せる
- 次カードを少し見切らせる
- CTAを明確にする

---

## CHOOSE

- 現在の横スワイプ思想を維持
- 一画面で全6件を見せようとしない
- 引き直しとScopeはコンパクトに

---

## EXPLORE

第一候補:

`ジャンル | テーマ`

切替式。

理由:

- 2つの大ブロック縦積みを避ける
- 探索という同一目的を明確化

---

## REFLECT

- Recent Notesを先
- Recent Otherはその後
- Statsは最下部または折りたたみ候補

---

# 13. Above the Fold ルール

ホームを開いた直後に競わせる主行動は最大2つ。

許可:

- Continue
- Choose

原則Above the Foldへ置かない:

- Stats
- Priority件数
- Recently Edited
- Wallet Stacks全体
- Recent Notes
- Recent Works

例外:

- Critical Security Alert

---

# 14. 情報の強度ルール

## Level 1 — Action

強く表示:

- タイトル
- 続きを見る / 読む
- 読み始める
- 進捗

## Level 2 — Context

中程度:

- 作者
- 状態
- ジャンル
- Priority

## Level 3 — Management

弱く表示:

- 評価編集
- メモ編集
- 更新日時
- 件数
- Stats

Homeでは Level 1 > Level 2 > Level 3 を崩さない。

---

# 15. Home Composition 実装方針

新しい責務を `home-composition.js` 相当へ集約する。

名称は実装時に変更可能。

## Composition側が所有するもの

- ゾーン生成
- ゾーン順序
- State-aware順序
- Empty時のゾーン非表示
- 各Featureのmount先

## 各Feature側が所有するもの

- Feature内部のMarkup
- Feature内部のinteraction
- Feature内部のデータ取得・描画

## Feature側がやらないこと

- `random.after(...)`
- `priority.after(...)`
- `explore.before(...)`

のように他Featureとの位置関係を決めること。

---

# 16. MutationObserver整理方針

Phase 1で全Observerを消す必要はない。

ただし最終的には、Home内の配置維持のためだけにObserverを使わない。

Observerを許可する用途:

- Feature内部で非同期描画されたカードをdecorateする

Observerを避ける用途:

- セクション順序を維持する
- 別FeatureのDOMを移動し続ける

---

# 17. 移行Phase

## Phase 0 — Documentation / 現状固定

今回。

- 責務マップ確定
- 理想DOM確定
- PC / mobileワイヤー確定
- UI変更なし

完了条件:

この文書がmainに入っている。

---

## Phase 1 — Composition First

目的:

**機能を変えず、順序と責務だけ直す。**

実施:

- Home Composition導入
- ContinueをRandomより上へ
- Priority Hubを上位から降格
- Wallet Stacksを上位から外す
- Recently EditedをHome上位から外す
- Explore / Reflectを明示的なゾーンへ移す

このPhaseではカードデザインを大きく変更しない。

---

## Phase 2 — State-aware Home

目的:

active状態でホームの主役を変える。

実施:

- activeあり → Continue first
- activeなし → Choose first
- 候補なし → Explore繰り上げ
- 空セクションの非表示

---

## Phase 3 — Priority Integration

目的:

Priorityを管理ダッシュボードから意思決定ロジックへ変える。

実施:

- Continue / candidateの並びへの反映方法決定
- Home Hub縮小または削除
- Library整理導線強化

注意:

PriorityとRandomを混ぜて「高Priorityほど抽選されやすい」にしない。

RandomnessはRandomnessとして守る。

---

## Phase 4 — Explore Consolidation

目的:

Genre / Themeを一つの探索体験へ。

実施:

- PC: 1セクション2ペイン
- mobile: 切替方式を第一候補
- Wallet Stacksの再配置可否をこの時点で判断

---

## Phase 5 — Reflect Cleanup

目的:

振り返り領域の重複削減。

判断対象:

- Recent Notes
- Recent Other
- Recently Edited
- Stats

特に Recently Edited はLibraryへ完全移管できるか確認する。

---

# 18. レスポンシブ監査幅

最低限:

- 1440px
- 1280px
- 1024px
- 768px
- 390px
- 360px

---

# 19. データ状態テスト

最低限:

1. active 3件以上
2. active 1件
3. active 0件
4. Priority設定あり
5. Priority未設定
6. Random候補6件以上
7. Random候補1〜5件
8. Random候補0件
9. Genre / Theme多数
10. データほぼ空
11. Security alertあり

---

# 20. 成功基準

ホームを3秒見て、以下が分かる。

1. 今続けられる作品があるか
2. 次に選ぶならどこを見るか
3. 探したいならどこを見るか

さらに:

- 1操作以内に作品へ入れる
- ContinueとDiscoverの違いが視覚的に明確
- 管理UIが作品選択を邪魔しない
- PCとmobileで同じ情報を無理に同じ形で並べない

---

# 21. 却下条件

以下になった実装案は却下する。

- すべての現行セクションを残したまま順番だけ変える
- Priority / Wallet / FeaturedをすべてHome上位に残す
- mobileをPCの単純縦積みにする
- 空Continueを上位に残す
- Recently Editedを重要作品として扱う
- Statsを主行動より上に出す
- CSS `order` だけでDOM責務を隠す
- `!important` の追加でComposition問題を解決する
- セクション順序維持のためMutationObserverを増やす
- Featureごとに他Featureの位置を操作する
- RandomにPriority重み付けを混ぜる

---

# 22. Phase 1 実装前の最終チェックリスト

実装者はコード変更前に以下を回答する。

- 現在の最終DOM順は何か
- 各セクションはどのモジュールが生成するか
- どのモジュールが位置を変更するか
- Composition導入後、各Featureのmount先はどこか
- 削除ではなく移動になる機能は何か
- Libraryへ責務移管する機能は何か
- Empty stateで何が消えるか
- PC / mobileで順序差を持たせるか
- 既存操作を壊さずPhase 1を完了できるか

---

# 23. 最終設計原則

## Open loops before new loops

始めた作品を、新しい作品より少しだけ先に扱う。

## Action before information

情報を見せる前に、次の行動を明確にする。

## Discovery is not management

探索と管理を混ぜない。

## Randomness should stay random

偶然性を推薦ロジックへ変えない。

## State changes the home

ユーザーの状態に応じてホームの主役を変える。

## One section, one job

一つのセクションに複数の目的を背負わせない。

## Composition has one owner

ホームの配置責務を一か所に集約する。

---

# 24. 一文での完成形

**Contents Library のホームは、自分の作品履歴を眺める場所ではなく、これまで触れてきた作品とこれから触れる作品の間で「今どれに戻るか」を決める場所である。**

記録件数より、続きを。

管理より、選択を。

一覧より、一歩目を。
