import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// 本番で発生したフリーズの再現テスト。observe対象の属性/テキストを
// コールバック自身が無条件に書き換えると、値が変わっていなくても
// MutationRecordは生成されるため、observer→書き込み→observer…の
// 自己発火ループになる。queueMicrotaskで包んでいたためマイクロタスク
// キューが埋まり続け、描画・入力・DevToolsの接続まで止まった
// (「ページが反応せず、コンソールも開かない」の直接原因)。
//
// GuardedMutationObserverは、コールバックが閾値を超えて呼ばれたら
// 強制的にdisconnectしてテストを打ち切る安全弁。真の無限ループが
// 復活した場合に、テストプロセスごとハングするのを防ぐ。
function withGuardedObserver(window, limit = 50) {
  const Native = window.MutationObserver;
  const state = { count: 0, tripped: false };
  window.MutationObserver = class extends Native {
    constructor(callback) {
      super((records, observer) => {
        state.count += 1;
        if (state.count > limit) {
          state.tripped = true;
          observer.disconnect();
          return;
        }
        callback(records, observer);
      });
    }
  };
  return state;
}

function runScript(window, source) {
  const script = window.document.createElement('script');
  script.textContent = source;
  window.document.body.appendChild(script);
}

const tick = (window, ms = 0) => new Promise((resolve) => window.setTimeout(resolve, ms));

test('取込センターの行装飾は自己発火せず収束する(app-v20-import-orchestrator.js)', async () => {
  const source = await read('public/import-center/app-v20-import-orchestrator.js');
  const dom = new JSDOM(`<!doctype html><body>
    <div id="importCenterCard">
      <div class="import-actions"></div>
      <div id="importBatchList">
        <article class="import-batch-row" data-status="committing">
          <div class="import-batch-main"><span class="import-status"></span></div>
          <button type="button" data-import-action="commit">反映</button>
          <button type="button" data-import-action="delete">削除</button>
          <button type="button" data-import-action="rollback">取消</button>
        </article>
      </div>
    </div>
    <input id="importFileInput" type="file">
  </body>`, { runScripts: 'dangerously', url: 'http://localhost/' });

  const { window } = dom;
  window.fetch = async () => ({ ok: true, headers: new window.Headers(), json: async () => ({}) });
  const state = withGuardedObserver(window);

  try {
    runScript(window, source);
    await tick(window, 150); // importV20Startの初回setTimeout(100ms)を待つ

    const row = window.document.querySelector('.import-batch-row');
    assert.ok(row, 'テスト用の行が見つからない(DOM構造の前提が崩れている)');
    row.dataset.status = 'validated'; // observerを1回だけ人為的に発火させる

    await tick(window, 100);

    assert.ok(!state.tripped, `MutationObserverが${state.count}回以上呼ばれ続けた(自己発火ループの疑い)`);
    assert.ok(state.count <= 3, `1回の状態変更に対してobserverが${state.count}回発火した。冪等でない書き込みが残っている可能性がある`);
  } finally {
    // jsdomのwindowを明示的に閉じないと、暴走時に登録されたタイマーや
    // イベントリスナーがプロセス終了処理を長時間ブロックする
    // (実測: 51回でdisconnectしてもclose()なしではNode test runnerの
    // 終了待ちに2分以上かかった)。
    window.close();
  }
});

test('取込進捗パネルの更新は自己発火せず収束する(app-v10.js)', async () => {
  const source = await read('public/import-center/app-v10.js');
  // messageを「反映中…」にしてstate:'committing'の分岐へ導く。この分岐だけが
  // progressStartedAtをセットし、progressTick()のelapsed.textContent更新
  // (else if(progressStartedAt)側、signatureの対象外なので発火のたびに
  // 無条件で書き込まれる)を経由する、本番で実際にフリーズした経路。
  const dom = new JSDOM(`<!doctype html><body>
    <div id="importCenterCard">
      <div class="import-center-heading"></div>
      <div id="importCenterMessage" data-type="working">反映中… 残り50作品</div>
    </div>
  </body>`, { runScripts: 'dangerously', url: 'http://localhost/' });

  const { window } = dom;
  window.fetch = async () => ({ ok: true, headers: new window.Headers(), json: async () => ({}) });
  const state = withGuardedObserver(window);

  try {
    runScript(window, source);
    await tick(window, 150); // startImportProgressEnhancementの初回setTimeout(100ms)を待つ

    const guide = window.document.querySelector('#importProgressGuide');
    assert.ok(guide, 'ensureProgressUIが進行状況UIを生成していない(DOM構造の前提が崩れている)');

    const messageNode = window.document.querySelector('#importCenterMessage');
    messageNode.dataset.type = 'working'; // attributeFilterに含まれるdata-typeを直接変更しobserverを発火させる

    await tick(window, 200);

    assert.ok(!state.tripped, `MutationObserverが${state.count}回以上呼ばれ続けた(自己発火ループの疑い)`);
    assert.ok(state.count <= 4, `状態変更に対してobserverが${state.count}回発火した。冪等でない書き込みが残っている可能性がある`);
  } finally {
    window.close();
  }
});
