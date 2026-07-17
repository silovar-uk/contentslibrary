# 実装レポート v0.5

## 実装範囲

- Cloudflare Access JWTとD1の利用状態を組み合わせた二段階判定
- owner / admin / member / viewer
- 招待、一時停止、ブロック、解除、任意のAccessセッション失効
- 作品・体験・メモ・ジャンル・テーマ・タグ
- 再読・再視聴の履歴追加・編集・削除
- タイトル・作者・分類・メモの横断検索
- 保存ビュー
- 読書を優先したホーム
- スマホ1カラム・下部ナビ、PC 3カラム
- JSON / CSV / Markdownエクスポート

## v0.5 ビジュアルリファイン

- 明朝体とゴシック体の役割分担
- 紙の粒子、欄外注、通し番号、細い罫線を使った編集的な装丁
- 最初の読書カードを大きく扱う非対称グリッド
- 朱色の切り欠き型クイック追加パネル
- 一覧をカードではなく目録として見せる連番構成
- 選択中の作品を反転し、右側詳細を誌面の右ページとして表現
- 暗い索引ページとしてのフィルターパネル
- 編集用紙を意識したダイアログ
- スマホでも同じデザイン言語を維持
- IntersectionObserverによる控えめな表示モーション
- `prefers-reduced-motion`対応
- フォーカス表示とモバイルナビの現在地表示を調整

## 検証結果

- TypeScript型検査: 成功
- フロントエンドJavaScript構文確認: 成功
- Nodeテスト: 19件成功、失敗0件
- Wrangler deploy dry-run: 成功
- 既存の認証、所有権、検索、保存ビュー、履歴編集テストも成功
- GitHub Actions: 成功

## 未実施・本番時に必要な作業

- 実CloudflareアカウントでD1を作成し、`database_id`を設定
- Cloudflare Access Applicationを作成し、`TEAM_DOMAIN`と`POLICY_AUD`を設定
- 実IdPでの本番ログイン確認
- セッション失効を使う場合、Cloudflare API Secretを設定
- 実機・複数ブラウザでのE2E試験
- Access認証ログの自動取り込み
