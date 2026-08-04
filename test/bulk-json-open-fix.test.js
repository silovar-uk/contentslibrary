import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import test from "node:test";

test("JSONで追加ボタンを押すとダイアログが実際に開く", async () => {
  const dom = new JSDOM(`<!doctype html><body>
    <button id="bulkJsonTopButton" type="button" data-action="open-bulk-json-add">JSONで追加</button>
    <dialog id="bulkJsonAddDialog">
      <form id="bulkJsonAddForm" aria-busy="false">
        <textarea name="json"></textarea>
        <input name="allow_duplicates" type="checkbox">
      </form>
    </dialog>
  </body>`, { url: "https://example.test/" });

  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    Element: globalThis.Element,
    Event: globalThis.Event,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame
  };

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Element = dom.window.Element;
  globalThis.Event = dom.window.Event;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);

  const dialogPrototype = dom.window.HTMLDialogElement.prototype;
  dialogPrototype.showModal = function showModal() { this.setAttribute("open", ""); };
  dialogPrototype.close = function close() { this.removeAttribute("open"); };

  try {
    const { state } = await import("../public/core/store.js");
    state.loaded = true;
    const { initBulkJsonOpenFix } = await import("../public/views/bulk-json-open-fix.js");
    initBulkJsonOpenFix();

    dom.window.document.querySelector("#bulkJsonTopButton").click();
    await new Promise((resolve) => setTimeout(resolve, 20));

    const dialog = dom.window.document.querySelector("#bulkJsonAddDialog");
    assert.equal(dialog.open, true);
    assert.equal(dom.window.document.activeElement?.getAttribute("name"), "json");
  } finally {
    dom.window.close();
    Object.assign(globalThis, previous);
  }
});
