import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync=promisify(execFile);
const root=new URL('../',import.meta.url);
const read=(path)=>readFile(new URL(path,root),'utf8');
const script=fileURLToPath(new URL('../scripts/build-production-config.mjs',import.meta.url));

test('リモート環境は開発設定や未設定Accessをfail closedで拒否する',async()=>{
  const safety=await read('src/production-safety.ts');
  const auth=await read('src/auth.ts');
  assert.match(safety,/env\.APP_ENV !== "production"/);
  assert.match(safety,/env\.DEV_AUTH_ENABLED === "true"/);
  assert.match(safety,/env\.SEED_DEMO_DATA === "true"/);
  assert.match(safety,/AUTH_NOT_CONFIGURED/);
  assert.match(auth,/assertRuntimeConfiguration\(request, env\)/);
});

test('静的ファイルとhealthを含む全ルートが認証後に処理される',async()=>{
  const index=await read('src/index.ts');
  const authAt=index.indexOf('const auth = await authenticate(request, env)');
  const healthAt=index.indexOf('url.pathname === "/health"');
  const assetsAt=index.indexOf('env.ASSETS.fetch(request)');
  assert.ok(authAt>=0&&healthAt>authAt&&assetsAt>authAt);
});

test('既定Wrangler設定は公開先なし・開発認証なしで安全側に倒れる',async()=>{
  const config=JSON.parse(await read('wrangler.jsonc'));
  const dev=JSON.parse(await read('wrangler.dev.jsonc'));
  assert.equal(config.workers_dev,false);
  assert.equal(config.vars.APP_ENV,'production');
  assert.equal(config.vars.DEV_AUTH_ENABLED,'false');
  assert.equal(config.vars.SEED_DEMO_DATA,'false');
  assert.equal(dev.vars.DEV_AUTH_ENABLED,'true');
});

test('本番設定生成はカスタムドメイン・Access・D1を固定する',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'sakuhin-production-'));
  try{
    await execFileAsync(process.execPath,[script],{cwd,env:{
      ...process.env,
      D1_DATABASE_ID:'123e4567-e89b-12d3-a456-426614174000',
      APP_HOSTNAME:'library.example.com',
      TEAM_DOMAIN:'https://example.cloudflareaccess.com',
      POLICY_AUD:'0123456789abcdef0123456789abcdef',
      OWNER_EMAIL:'owner@example.com',
      ALLOW_OWNER_BOOTSTRAP:'true',
      WORKER_NAME:'sakuhin-log'
    }});
    const config=JSON.parse(await readFile(join(cwd,'.wrangler.production.jsonc'),'utf8'));
    assert.equal(config.workers_dev,false);
    assert.deepEqual(config.routes,[{pattern:'library.example.com',custom_domain:true}]);
    assert.equal(config.d1_databases[0].database_id,'123e4567-e89b-12d3-a456-426614174000');
    assert.equal(config.vars.APP_ENV,'production');
    assert.equal(config.vars.DEV_AUTH_ENABLED,'false');
    assert.equal(config.vars.SEED_DEMO_DATA,'false');
    assert.equal(config.vars.TEAM_DOMAIN,'https://example.cloudflareaccess.com');
    assert.equal(config.vars.POLICY_AUD,'0123456789abcdef0123456789abcdef');
  }finally{await rm(cwd,{recursive:true,force:true});}
});

test('本番必須値が欠けている場合は設定生成を停止する',async()=>{
  const cwd=await mkdtemp(join(tmpdir(),'sakuhin-production-invalid-'));
  try{
    let message='';
    try{
      await execFileAsync(process.execPath,[script],{cwd,env:{...process.env,D1_DATABASE_ID:'123e4567-e89b-12d3-a456-426614174000'}});
    }catch(error){message=`${error.message}\n${error.stderr||''}`;}
    assert.match(message,/APP_HOSTNAME is required/);
  }finally{await rm(cwd,{recursive:true,force:true});}
});

test('本番デプロイは手動実行しD1移行後にWorkerを公開する',async()=>{
  const workflow=await read('.github/workflows/deploy-production.yml');
  assert.match(workflow,/workflow_dispatch/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/d1 migrations apply DB --remote/);
  assert.match(workflow,/deploy --config \.wrangler\.production\.jsonc/);
  assert.ok(workflow.indexOf('Apply D1 migrations')<workflow.indexOf('Deploy Worker'));
});
