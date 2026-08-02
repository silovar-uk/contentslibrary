import { esc } from "./dom.js";

export const TYPE_LABELS = { book: "本", manga: "漫画", movie: "映画", anime: "アニメ", drama: "ドラマ", other: "その他" };
export const STATUS_LABELS = { want: "読みたい・見たい", owned_unread: "所持・未読", active: "進行中", completed: "完了", paused: "一時停止", dropped: "中断" };
export const NOTE_LABELS = { quick: "一言", summary: "要約", impression: "印象", quote: "引用", idea: "自分の考え", connection: "接続", progress: "途中メモ" };

export const MEDIA_CONFIG = {
  book: { creator: "著者", creatorPlaceholder: "著者名", unit: "ページ", current: "読んだ位置", total: "総ページ数", statuses: { owned_unread: "所持・未読", want: "読みたい", active: "読書中", completed: "読了", paused: "保留", dropped: "読むのをやめた" } },
  manga: { creator: "作者", creatorPlaceholder: "作者名", unit: "巻", current: "読んだ巻", total: "既刊・全巻", statuses: { owned_unread: "所持・未読", want: "読みたい", active: "読書中", completed: "既刊読了", paused: "保留", dropped: "読むのをやめた" } },
  movie: { creator: "監督", creatorPlaceholder: "監督名", unit: "分", current: "鑑賞位置", total: "上映時間", statuses: { owned_unread: "所持・未読", want: "見たい", active: "鑑賞中", completed: "鑑賞済み", paused: "保留", dropped: "見るのをやめた" } },
  anime: { creator: "監督・制作", creatorPlaceholder: "監督名・制作会社", unit: "話", current: "見た話数", total: "全話数", statuses: { owned_unread: "所持・未読", want: "見たい", active: "視聴中", completed: "視聴済み", paused: "保留", dropped: "見るのをやめた" } },
  drama: { creator: "監督・制作", creatorPlaceholder: "監督名・制作会社", unit: "話", current: "見た話数", total: "全話数", statuses: { owned_unread: "所持・未読", want: "見たい", active: "視聴中", completed: "視聴済み", paused: "保留", dropped: "見るのをやめた" } },
  other: { creator: "作者・制作者", creatorPlaceholder: "作者・制作者名", unit: "件", current: "現在位置", total: "全体", statuses: STATUS_LABELS }
};

export const mediaConfig = (type) => MEDIA_CONFIG[type] || MEDIA_CONFIG.other;
export const statusLabel = (type, status) => mediaConfig(type).statuses[status] || STATUS_LABELS[status] || status;
export const stars = (rating) => (rating ? `★ ${Number(rating).toFixed(1)}` : "未評価");

export function ratingLevel(work) {
  const value = Number(work?.rating);
  return Number.isFinite(value) && value > 0 ? Math.min(5, Math.max(1, Math.round(value))) : 0;
}

// カード上で詳細を開かずに5段階評価を付けられるようにする、一覧・ホーム共通のミニ★コントロール。
export function cardRatingMarkup(work) {
  const level = ratingLevel(work);
  const id = esc(work.id);
  return `<div class="card-rating" role="group" aria-label="評価">${[1, 2, 3, 4, 5]
    .map((v) => `<button type="button" class="card-star ${v <= level ? "is-on" : ""}" data-card-rating="${id}" data-rating-value="${v}" aria-label="評価 ${v}" aria-pressed="${level === v}">★</button>`)
    .join("")}</div>`;
}

// src/domain/genre-catalog-v15.ts と同じ23ジャンル・同じ色。ジャンル棚とラベル色分けの両方で使う。
export const GENRE_CATALOG = [
  { id: "fiction", name: "小説", color: "#8E3B46" },
  { id: "mystery", name: "ミステリー", color: "#7A3B5A" },
  { id: "sf", name: "SF", color: "#2F5F7A" },
  { id: "fantasy", name: "ファンタジー", color: "#5A6E3B" },
  { id: "romance", name: "恋愛", color: "#B4576F" },
  { id: "essay", name: "エッセイ", color: "#B65F47" },
  { id: "manga", name: "漫画", color: "#9B416C" },
  { id: "business", name: "ビジネス・経営", color: "#31577A" },
  { id: "marketing", name: "マーケティング・広報", color: "#B44732" },
  { id: "society", name: "社会・政治", color: "#4C6280" },
  { id: "history", name: "歴史", color: "#9A6B32" },
  { id: "philosophy", name: "哲学・思想", color: "#72588A" },
  { id: "psychology", name: "心理・認知", color: "#39766F" },
  { id: "science", name: "科学", color: "#356AA0" },
  { id: "technology", name: "IT・テクノロジー", color: "#267C8D" },
  { id: "language", name: "言語・文章", color: "#526F82" },
  { id: "education", name: "教育・学習", color: "#63814A" },
  { id: "sports", name: "スポーツ", color: "#347A5A" },
  { id: "games", name: "将棋・ゲーム", color: "#A36B21" },
  { id: "health", name: "健康・医療", color: "#A65264" },
  { id: "art", name: "芸術・デザイン", color: "#7650A0" },
  { id: "life", name: "料理・生活", color: "#71804A" },
  { id: "other", name: "その他", color: "#737773" }
];

export function genreColorForWork(work) {
  const name = work?.labels?.genre?.[0];
  const match = GENRE_CATALOG.find((g) => g.name === name);
  return match?.color || "#737773";
}
