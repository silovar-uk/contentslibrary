import { normalizeText } from "../db";

export type GenreDefinitionV15 = {
  id: string;
  name: string;
  color: string;
  aliases: readonly string[];
};

export const GENRE_CATALOG_V15 = [
  { id: "fiction", name: "小説", color: "#8E3B46", aliases: ["小説", "文芸", "フィクション"] },
  { id: "essay", name: "エッセイ", color: "#B65F47", aliases: ["エッセイ", "随筆"] },
  { id: "manga", name: "漫画", color: "#9B416C", aliases: ["漫画", "マンガ", "コミック"] },
  { id: "business", name: "ビジネス・経営", color: "#31577A", aliases: ["ビジネス・経営", "ビジネス", "ビジネス書", "経営", "組織・経営"] },
  { id: "marketing", name: "マーケティング・広報", color: "#B44732", aliases: ["マーケティング・広報", "マーケティング", "広報", "PR", "ブランディング"] },
  { id: "society", name: "社会・政治", color: "#4C6280", aliases: ["社会・政治", "社会", "政治"] },
  { id: "history", name: "歴史", color: "#9A6B32", aliases: ["歴史"] },
  { id: "philosophy", name: "哲学・思想", color: "#72588A", aliases: ["哲学・思想", "哲学", "思想", "哲学思想"] },
  { id: "psychology", name: "心理・認知", color: "#39766F", aliases: ["心理・認知", "心理", "認知", "心理学"] },
  { id: "science", name: "科学", color: "#356AA0", aliases: ["科学", "サイエンス"] },
  { id: "technology", name: "IT・テクノロジー", color: "#267C8D", aliases: ["IT・テクノロジー", "IT", "テクノロジー", "情報技術", "技術"] },
  { id: "language", name: "言語・文章", color: "#526F82", aliases: ["言語・文章", "言語", "文章", "ライティング"] },
  { id: "education", name: "教育・学習", color: "#63814A", aliases: ["教育・学習", "教育", "学習"] },
  { id: "sports", name: "スポーツ", color: "#347A5A", aliases: ["スポーツ"] },
  { id: "games", name: "将棋・ゲーム", color: "#A36B21", aliases: ["将棋・ゲーム", "将棋", "ゲーム"] },
  { id: "health", name: "健康・医療", color: "#A65264", aliases: ["健康・医療", "健康", "医療"] },
  { id: "art", name: "芸術・デザイン", color: "#7650A0", aliases: ["芸術・デザイン", "芸術", "デザイン", "アート"] },
  { id: "life", name: "料理・生活", color: "#71804A", aliases: ["料理・生活", "料理", "生活"] },
  { id: "other", name: "その他", color: "#737773", aliases: ["その他"] }
] as const satisfies readonly GenreDefinitionV15[];

const aliasIndex = new Map<string, GenreDefinitionV15>();
for (const genre of GENRE_CATALOG_V15) {
  for (const alias of genre.aliases) aliasIndex.set(normalizeText(alias), genre);
}

export function getGenreByIdV15(id: string): GenreDefinitionV15 | null {
  return GENRE_CATALOG_V15.find((genre) => genre.id === id) ?? null;
}

export function resolveGenreV15(rawName: string | null): GenreDefinitionV15 | null {
  if (!rawName) return null;
  return aliasIndex.get(normalizeText(rawName)) ?? null;
}

export function normalizedAliasesForGenreV15(id: string): string[] {
  const genre = getGenreByIdV15(id);
  return genre ? genre.aliases.map(normalizeText) : [];
}

export function allNormalizedGenreAliasesV15(): string[] {
  return Array.from(new Set(GENRE_CATALOG_V15.flatMap((genre) => genre.aliases.map(normalizeText))));
}
