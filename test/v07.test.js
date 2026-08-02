import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');

test('ホームはNotion単発取込と作品カードの進捗表示を持つ',async()=>{
  const home=await read('public/views/home.js');
  const html=await read('public/index.html');
  const library=await read('public/views/library.js');
  assert.match(html,/Notionのリストを取り込む/);
  assert.match(home,/\/api\/admin\/notion-import/);
  assert.match(library,/card-footer/);
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
