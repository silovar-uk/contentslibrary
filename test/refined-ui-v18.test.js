import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

// v18は「後から差し込んだCSSがちらつく」問題を、起動画面を2段階で隠す仕掛けで
// 誤魔化していたレイヤー。再構築後はCSSが1枚で<head>にあり、ちらつきの原因自体が
// なくなったため、起動画面の仕掛けごと不要になった。ここではその単純化を検証する。

test('起動画面の隠蔽ギミックを持たない', async () => {
  const html = await read('public/index.html');
  assert.doesNotMatch(html, /ui-booting/);
  assert.doesNotMatch(html, /__sakuhinLogBootTimer/);
  assert.doesNotMatch(html, /sakuhinBootPulse/);
});

test('CSSは<head>で通常のlinkとして先読みする(JSによる段階的差し込みをしない)', async () => {
  const html = await read('public/index.html');
  const headEnd = html.indexOf('</head>');
  const tokensLink = html.indexOf('/styles/tokens.css');
  const appLink = html.indexOf('/styles/app.css');
  assert.ok(tokensLink >= 0 && tokensLink < headEnd);
  assert.ok(appLink >= 0 && appLink < headEnd);
});

test('作品カードは選択中だけ強調し、通常時は浮かせない', async () => {
  const css = await read('public/styles/app.css');
  assert.match(css, /\.work-card\[aria-current="true"\]\{border-color:var\(--accent\);box-shadow:inset 4px 0 var\(--accent\)\}/);
});
