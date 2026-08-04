// 表紙画像(Amazon商品画像)の登録・表示まわりの純粋関数と、貼り付けURLの当たりを付ける処理。
// サーバー側の許可ホスト・正規化ロジック(src/routes/work-cover.ts)と対になっている。
// 個人の記録用途に限定した直リンクであり、再配布・公開用途では使わないこと。

const ALLOWED_HOSTS = new Set(["m.media-amazon.com", "images-na.ssl-images-amazon.com"]);

export function isAllowedCoverUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// ISBN-13(978始まり)からISBN-10を計算する。Amazonの/images/P/形式はISBN-10でしか当たらないため。
export function isbn13ToIsbn10(isbn13) {
  const digits = String(isbn13 || "").replace(/[^0-9]/g, "");
  if (digits.length !== 13 || !digits.startsWith("978")) return null;
  const core = digits.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(core[i]);
  const check = (11 - (sum % 11)) % 11;
  return core + (check === 10 ? "X" : String(check));
}

export function amazonCoverUrlFromIsbn10(isbn10) {
  const clean = String(isbn10 || "").toUpperCase().trim();
  // ISBN-10は数字9桁+チェックディジット(0-9またはX)。英字混じりのASIN(映像作品など)は
  // ここでnullになり、呼び出し側で「自動取得できない」案内に回る(意図した挙動)。
  if (!/^[0-9]{9}[0-9X]$/.test(clean)) return null;
  return `https://m.media-amazon.com/images/P/${clean}.09.LZZZZZZZ.jpg`;
}

// 作品のai_facts(AI事実補完・detail.js)からISBNを拾い、候補URLを組み立てる。本・漫画のみ当たる。
export function candidateCoverUrlFromWork(work) {
  const fact = work?.metadata?.ai_facts?.work;
  if (!fact) return null;
  const isbn10 = fact.isbn_10 ? String(fact.isbn_10).replace(/[^0-9X]/gi, "") : null;
  if (isbn10 && isbn10.length === 10) return amazonCoverUrlFromIsbn10(isbn10);
  const derived = fact.isbn_13 ? isbn13ToIsbn10(fact.isbn_13) : null;
  return derived ? amazonCoverUrlFromIsbn10(derived) : null;
}

// amazon.co.jp/amazon.com の商品ページURLからASIN(本ならISBN-10と同じ桁)を取り出す。
export function extractAsinFromProductUrl(pageUrl) {
  try {
    const u = new URL(pageUrl);
    if (!/(^|\.)amazon\.[a-z.]+$/i.test(u.hostname)) return null;
    const m = u.pathname.match(/\/(?:dp|gp\/product|ASIN)\/([A-Za-z0-9]{10})/);
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

// 既存データには旧仕様の中サイズ(MZZZZZZZ/SL300)が残っている。
// DBを一括更新しなくても、詳細表示だけは高解像度候補へ引き上げる。
export function coverDisplayUrl(url) {
  if (!url) return "";
  if (url.includes(".THUMBZZZ.")) return url.replace(".THUMBZZZ.", ".LZZZZZZZ.");
  if (url.includes(".MZZZZZZZ.")) return url.replace(".MZZZZZZZ.", ".LZZZZZZZ.");
  if (url.includes("._SL110_")) return url.replace("._SL110_", "._SL800_");
  if (url.includes("._SL300_")) return url.replace("._SL300_", "._SL800_");
  return url;
}

// 一覧・ホームは詳細用画像をそのまま読むと重いため、中解像度へ落とす。
// 旧仕様の極小THUMB/SL110は使わず、Retina表示でも粗くなりにくいサイズを選ぶ。
export function coverThumbUrl(url) {
  const displayUrl = coverDisplayUrl(url);
  if (!displayUrl) return "";
  if (displayUrl.includes(".LZZZZZZZ.")) return displayUrl.replace(".LZZZZZZZ.", ".MZZZZZZZ.");
  if (displayUrl.includes("._SL800_")) return displayUrl.replace("._SL800_", "._SL320_");
  return displayUrl;
}

// 表紙が無いISBN/ASINは404ではなく「200・43バイトの透明1x1 GIF」を返すためonerrorが発火しない。
// 読み込み後にnaturalWidthを見て、実体のある画像かどうかを判定する。
export function probeCoverImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    img.onload = () => finish(img.naturalWidth > 1);
    img.onerror = () => finish(false);
    img.src = url;
    setTimeout(() => finish(false), 6000);
  });
}
