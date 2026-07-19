import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');

test('v0.7の実用UIレイヤーを最後に読み込む',async()=>{
  const entry=await read('public/app.js');
  const css=await read('public/v07.css');
  const app=await read('public/app-v07.js');
  assert.match(entry,/app-v07\.js/);
  assert.match(css,/practical daily-use layer/);
  assert.match(css,/\.reading-card,\.reading-card:first-child/);
  assert.match(css,/border-left:4px solid var\(--v07-accent\)/);
  assert.match(app,/Notionのリストを取り込む/);
  assert.match(app,/v07-card-footer/);
});

test('Notion最新20件を整形済みデータとして保持する',async()=>{
  const seed=await read('src/notion-seed.ts');
  assert.equal((seed.match(/sourceKey: "notion:/g)||[]).length,20);
  for(const title of ['テスカトリポカ','図書館の大魔術師','傲慢と善良','YABUNONAKA']) assert.match(seed,new RegExp(title));
  assert.match(seed,/NOTION_DATABASE_URL/);
});

test('Notion取り込みはsource_keyで重複を防ぐ',async()=>{
  const migration=await read('migrations/0003_import_sources.sql');
  const route=await read('src/routes/notion-import.ts');
  assert.match(migration,/ADD COLUMN source_key/);
  assert.match(migration,/UNIQUE INDEX/);
  assert.match(route,/INSERT OR IGNORE INTO works/);
  assert.match(route,/NOTION_IMPORT_COMPLETED/);
  assert.match(route,/Notion移行/);
});

test('管理APIから取り込み状況確認と実行ができる',async()=>{
  const index=await read('src/index.ts');
  assert.match(index,/GET" && path === "\/api\/admin\/notion-import/);
  assert.match(index,/POST" && path === "\/api\/admin\/notion-import/);
  assert.match(index,/getNotionImportStatus/);
  assert.match(index,/importNotionSeed/);
});

test('ホームは本だけでなく進行中の全媒体を扱う',async()=>{
  const home=await read('src/routes/home-v07.ts');
  const index=await read('src/index.ts');
  assert.match(home,/status = 'active'/);
  assert.equal(/type = 'book' AND status = 'active'/.test(home),false);
  assert.match(index,/getHomeV07/);
});
