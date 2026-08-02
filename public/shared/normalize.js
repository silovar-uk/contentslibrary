// 検索用テキスト正規化。サーバー(src/db.ts、ビルド時に相対importでこのファイルへ到達し
// Workerへバンドルされる)とフロントエンド(public/core/store.js)の双方から同じ実装を使う。
// normalizeTextの挙動がずれると、フロントの即時フィルタとサーバーのLIKE検索が食い違う。
/**
 * @param {string} value
 * @returns {string}
 */
export function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, " ")
    .trim();
}
