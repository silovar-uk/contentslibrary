import { $ } from "../core/dom.js";
import { WORK_STATUSES, WORK_TYPES } from "../shared/work-domain.js";
import { workImportTemplateJson } from "../shared/work-import-template.js";

function chatGptPrompt() {
  return [
    "Contents Libraryに作品をJSONで追加したいです。",
    "これから私が伝える作品情報を、下記のひな形に合わせたJSONにしてください。",
    "出力はそのまま貼り付けられるJSONのみ。説明文やMarkdownのコードフェンスは不要です。",
    "不明な項目は無理に推測せず、null・空文字・空配列を使ってください。",
    `typeは ${WORK_TYPES.join(" / ")} のいずれか、statusは ${WORK_STATUSES.join(" / ")} のいずれかにしてください。`,
    "最大10作品まで1つの配列にまとめてください。",
    "",
    "ひな形:",
    workImportTemplateJson(),
    "",
    "追加したい作品:"
  ].join("\n");
}

function openChatGpt() {
  const url = `https://chatgpt.com/?prompt=${encodeURIComponent(chatGptPrompt())}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function initBulkJsonChatGpt() {
  const button = $("[data-bulk-json-action='copy-template']");
  if (!button) return;

  button.dataset.bulkJsonAction = "open-chatgpt-template";
  button.textContent = "ChatGPTでJSONを作る";
  button.title = "JSONひな形をプロンプトに入れてChatGPTを開く";

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-bulk-json-action='open-chatgpt-template']");
    if (!target) return;
    event.preventDefault();
    openChatGpt();
  });
}
