import { labelFromTitle } from "./work-face.js";

export function sourceShelfData(works = [], kind = "label") {
  const groups = new Map();
  for (const work of works) {
    const name = kind === "creator"
      ? String(work?.creator || "").trim()
      : labelFromTitle(work?.title || "").label;
    if (!name) continue;
    const item = groups.get(name) || { name, count: 0, works: [] };
    item.count += 1;
    if (item.works.length < 3) item.works.push(work);
    groups.set(name, item);
  }
  return [...groups.values()]
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
}
