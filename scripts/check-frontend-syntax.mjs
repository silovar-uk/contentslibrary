// public/ 配下の全*.jsを構文チェックする。ファイル一覧を手書きで列挙すると
// リファクタのたびに更新漏れが起きるため、ディレクトリを走査する。
import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function collectJsFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectJsFiles(full));
    else if (entry.endsWith(".js")) files.push(full);
  }
  return files;
}

const files = collectJsFiles("public");
for (const file of files) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
console.log(`checked ${files.length} frontend files`);
