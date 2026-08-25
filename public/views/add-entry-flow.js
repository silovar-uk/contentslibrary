import { $ } from "../core/dom.js";

let initialized = false;

function ensureStyle() {
  if ($('link[href="/styles/add-entry-flow.css"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/styles/add-entry-flow.css";
  document.head.append(link);
}

function mountChoiceDialog() {
  if ($("#addEntryChoiceDialog")) return;
  const dialog = document.createElement("dialog");
  dialog.id = "addEntryChoiceDialog";
  dialog.className = "app-dialog add-entry-choice-dialog";
  dialog.innerHTML = `
    <div class="add-entry-choice-shell">
      <header>
        <div>
          <p class="eyebrow">ADD WORKS</p>
          <h2>まとめて追加</h2>
          <p class="dialog-lead">登録したい内容に合わせて、追加方法を選んでください。</p>
        </div>
        <button type="button" class="icon-button" data-add-entry-close aria-label="閉じる">×</button>
      </header>
      <div class="add-entry-choice-grid">
        <button type="button" class="add-entry-choice-card" data-add-entry-choice="titles">
          <span class="add-entry-choice-kicker">QUICK</span>
          <strong>タイトルだけ追加</strong>
          <small>1行に1作品。最大10件を同じ種別・状態でまとめて登録。</small>
          <span class="add-entry-choice-link">タイトル入力へ →</span>
        </button>
        <button type="button" class="add-entry-choice-card is-detailed" data-add-entry-choice="json">
          <span class="add-entry-choice-kicker">DETAIL</span>
          <strong>詳しい情報も追加</strong>
          <small>作品情報・分類・メモなどを、JSONで最大10件まとめて登録。</small>
          <span class="add-entry-choice-link">ChatGPTも使える →</span>
        </button>
      </div>
      <footer class="dialog-actions add-entry-choice-footer">
        <span class="shortcut-hint">1作品だけなら「個別に追加」がおすすめ</span>
        <button type="button" class="ghost-button" data-add-entry-close>キャンセル</button>
      </footer>
    </div>`;
  document.body.append(dialog);
}

function mountTopEntry() {
  const singleAdd = $(".top-actions [data-action='open-work-dialog']");
  if (!singleAdd) return;

  singleAdd.textContent = "＋ 個別に追加";
  singleAdd.title = "1作品ずつ詳しく追加";
  singleAdd.classList.add("single-add-top-trigger");

  const titleBulk = $("#bulkAddTopButton");
  const jsonBulk = $("#bulkJsonTopButton");
  if (titleBulk) {
    titleBulk.hidden = true;
    titleBulk.setAttribute("aria-hidden", "true");
    titleBulk.tabIndex = -1;
  }
  if (jsonBulk) {
    jsonBulk.hidden = true;
    jsonBulk.setAttribute("aria-hidden", "true");
    jsonBulk.tabIndex = -1;
  }

  if (!$("#addEntryBulkTopButton")) {
    const button = document.createElement("button");
    button.id = "addEntryBulkTopButton";
    button.type = "button";
    button.className = "ghost-button add-entry-bulk-top-trigger";
    button.dataset.action = "open-add-entry-choice";
    button.textContent = "まとめて追加";
    button.title = "複数作品をまとめて追加";
    singleAdd.before(button);
  }
}

function enhanceChatGptEntry() {
  const button = $("[data-bulk-json-action='open-chatgpt-template']");
  const actions = $("#bulkJsonAddForm .bulk-json-actions");
  if (!button || !actions || button.closest(".bulk-json-chatgpt-callout")) return;

  button.classList.remove("text-button", "ghost-button");
  button.classList.add("primary-button", "bulk-json-chatgpt-cta");
  button.textContent = "ChatGPTでJSONを作る";
  button.title = "Contents Library用の貼り付けJSONをChatGPTで作成";

  const callout = document.createElement("section");
  callout.className = "bulk-json-chatgpt-callout";
  callout.setAttribute("aria-label", "ChatGPTでJSONを作成");
  callout.innerHTML = `
    <div class="bulk-json-chatgpt-copy">
      <span>JSONがなくてもOK</span>
      <strong>ChatGPTで貼り付け用JSONを作成</strong>
      <small>作品名を伝えて、できたJSONをこの画面へ貼り付けます。</small>
    </div>`;
  callout.append(button);
  actions.before(callout);

  if (!$("#bulkJsonExistingLabel")) {
    const label = document.createElement("p");
    label.id = "bulkJsonExistingLabel";
    label.className = "bulk-json-existing-label";
    label.textContent = "JSONをすでに持っている場合";
    actions.before(label);
  }
}

function openChoiceDialog() {
  const dialog = $("#addEntryChoiceDialog");
  if (!dialog || dialog.open) return;
  dialog.showModal();
}

function handOffToExistingFlow(kind) {
  const dialog = $("#addEntryChoiceDialog");
  if (dialog?.open) dialog.close();

  const trigger = kind === "titles" ? $("#bulkAddTopButton") : $("#bulkJsonTopButton");
  if (!trigger) return;
  requestAnimationFrame(() => trigger.click());
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='open-add-entry-choice']")) {
      event.preventDefault();
      openChoiceDialog();
      return;
    }

    if (event.target.closest("[data-add-entry-close]")) {
      event.preventDefault();
      $("#addEntryChoiceDialog")?.close();
      return;
    }

    const choice = event.target.closest("[data-add-entry-choice]")?.dataset.addEntryChoice;
    if (choice === "titles" || choice === "json") {
      event.preventDefault();
      handOffToExistingFlow(choice);
    }
  });
}

export function initAddEntryFlow() {
  if (initialized) return;
  initialized = true;
  ensureStyle();
  mountChoiceDialog();
  mountTopEntry();
  enhanceChatGptEntry();
  bindEvents();
}
