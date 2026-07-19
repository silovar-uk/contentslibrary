import { writeFile } from 'node:fs/promises';

const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
};

const workerName = (process.env.WORKER_NAME || 'sakuhin-log').trim();
const databaseId = required('D1_DATABASE_ID');
const teamDomain = required('TEAM_DOMAIN').replace(/\/$/, '');
const policyAud = required('POLICY_AUD');
const ownerEmail = required('OWNER_EMAIL').toLowerCase();
const allowOwnerBootstrap = (process.env.ALLOW_OWNER_BOOTSTRAP || 'false').toLowerCase();

if (!/^[a-z0-9-]+$/.test(workerName)) throw new Error('WORKER_NAME must contain only lowercase letters, numbers, and hyphens.');
if (!/^[0-9a-f-]{32,36}$/i.test(databaseId) || /^0+$/.test(databaseId.replaceAll('-', ''))) throw new Error('D1_DATABASE_ID is not configured.');

const teamUrl = new URL(teamDomain);
if (teamUrl.protocol !== 'https:' || teamUrl.pathname !== '/' || teamDomain.includes('your-team')) throw new Error('TEAM_DOMAIN must be the HTTPS Cloudflare Access team domain.');
if (policyAud.length < 12 || policyAud.startsWith('replace-')) throw new Error('POLICY_AUD is not configured.');
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) throw new Error('OWNER_EMAIL must be a valid email address.');
if (!['true', 'false'].includes(allowOwnerBootstrap)) throw new Error('ALLOW_OWNER_BOOTSTRAP must be true or false.');

const config = {
    $schema: './node_modules/wrangler/config-schema.json',
    name: workerName,
    main: 'src/index.ts',
    compatibility_date: '2026-07-17',
    compatibility_flags: ['nodejs_compat'],
    workers_dev: true,
    preview_urls: false,
    assets: {
          directory: './public',
          binding: 'ASSETS',
          run_worker_first: true,
          not_found_handling: 'single-page-application'
    },
    d1_databases: [{
          binding: 'DB',
          database_name: workerName,
          database_id: databaseId,
          migrations_dir: 'migrations'
    }],
    vars: {
          APP_ENV: 'production',
          DEV_AUTH_ENABLED: 'false',
          OWNER_EMAIL: ownerEmail,
          ALLOW_OWNER_BOOTSTRAP: allowOwnerBootstrap,
          SEED_DEMO_DATA: 'false',
          TEAM_DOMAIN: teamDomain,
          POLICY_AUD: policyAud
    }
};

await writeFile('.wrangler.production.jsonc', `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Production config generated for worker ${workerName} on workers.dev (owner bootstrap: ${allowOwnerBootstrap}).`);
