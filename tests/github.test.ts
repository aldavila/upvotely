import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { z } from 'zod';

// Load real handlers while replacing all external side effects. Unexpected
// imports and network calls fail closed; no auth or Prisma client is loaded.
function load(file: string, db: unknown, options: {
  secret?: string;
  fetch?: typeof fetch;
  createIssue?: (...args: unknown[]) => unknown;
  authenticated?: boolean;
  errors?: unknown[][];
  webhooks?: unknown[][];
} = {}): any {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    module, exports: module.exports, Buffer, URL, Response,
    console: { error(...args: unknown[]) { options.errors?.push(args); } },
    process: { env: { GITHUB_WEBHOOK_SECRET: options.secret } },
    fetch: options.fetch ?? (() => { throw new Error('Unexpected network call'); }),
    require(name: string) {
      if (name === '@/lib/webhooks/emit') return { emitWebhook: (...args: unknown[]) => options.webhooks?.push(JSON.parse(JSON.stringify(args))) };
      if (name === '@/lib/db') return { db };
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/auth') return { auth: async () => options.authenticated === false ? null : ({ user: { id: 'user-a' } }) };
      if (name === 'zod') return { z };
      if (name === 'node:crypto') return require('node:crypto');
      if (name === '@/lib/github-security' || name === '../github-security') {
        return load('src/lib/github-security.ts', db, options);
      }
      if (name === '@/lib/integrations/github') {
        return options.createIssue ? { createGitHubIssue: options.createIssue } : load(exporter, db, options);
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return module.exports;
}

// Small in-memory Prisma boundary: honor filters instead of returning a canned
// row, so losing a tenant/repository predicate changes the observable result.
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (key === 'AND') return value.every((part: any) => matches(row, part));
    if (key === 'integrationId_entityType_entityId' || key === 'organizationId_type') return matches(row, value);
    if (value && typeof value === 'object') {
      if ('in' in value) return value.in.includes(row[key]);
      if ('equals' in value) {
        const actual = value.path ? value.path.reduce((v: any, p: string) => v?.[p], row[key]) : row[key];
        return value.mode === 'insensitive'
          ? actual?.toLowerCase() === value.equals.toLowerCase() : actual === value.equals;
      }
      return row[key] != null && matches(row[key], value);
    }
    return row[key] === value;
  });
}

function fixtures() {
  const integrations = ['a', 'b'].map((key) => ({
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
    slackConnectionCodeHash: randomBytes(32).toString('hex'),
    id: `integration-${key}`, organizationId: `org-${key}`, type: 'github', isActive: true,
    config: { owner: 'example', repo: `repo-${key}`, repository: `example/repo-${key}`, accessToken: '', webhookSecret: key === 'b' ? secret : randomBytes(32).toString('hex') },
    organization: { statuses: [{ id: `complete-${key}`, type: 'complete' }] },
  }));
  const posts = ['a', 'b'].map((key) => ({
    id: key === 'a' ? 'cm00000000000000000000001' : 'cm00000000000000000000002',
    title: `Post ${key}`, content: 'Feedback', voteCount: 1, tags: [],
    board: { name: 'Board', organizationId: `org-${key}` },
    status: { name: 'Open' }, statusId: 'open',
  }));
  const syncs: any[] = integrations.map((integration, i) => ({
    id: `sync-${i}`, integrationId: integration.id, integration,
    entityType: 'post', entityId: posts[i].id, externalId: '7',
    externalUrl: `https://github.com/example/repo-${i === 0 ? 'a' : 'b'}/issues/7`,
    metadata: {}, status: 'synced', direction: 'outbound',
  }));
  let reads = 0;
  function table(rows: any[]) {
    return {
      async findFirst({ where }: any) { reads++; return rows.find((r) => matches(r, where)) ?? null; },
      async findUnique({ where }: any) { reads++; return rows.find((r) => matches(r, where)) ?? null; },
      async findMany({ where }: any) { reads++; return rows.filter((r) => matches(r, where)); },
      async create({ data }: any) {
        if (rows === syncs && rows.some((r) => matches(r, {
          integrationId: data.integrationId, entityType: data.entityType, entityId: data.entityId,
        }))) throw Object.assign(new Error('Unique constraint'), { code: 'P2002' });
        const row = { id: `new-${rows.length}`, createdAt: new Date(), ...data };
        rows.push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = rows.find((r) => matches(r, where));
        if (!row) throw new Error('Not found');
        Object.assign(row, data);
        return row;
      },
      async deleteMany({ where }: any) {
        let count = 0;
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i], where)) { rows.splice(i, 1); count++; }
        }
        return { count };
      },
      async updateMany({ where, data }: any) {
        const found = rows.filter((r) => matches(r, where));
        found.forEach((row) => Object.assign(row, data));
        return { count: found.length };
      },
      async upsert({ where, create, update }: any) {
        const row = rows.find((r) => matches(r, where));
        if (row) { Object.assign(row, update); return row; }
        const added = { id: `new-${rows.length}`, ...create };
        rows.push(added);
        return added;
      },
    };
  }
  const db = {
    integration: table(integrations), integrationSync: table(syncs), post: table(posts),
    organizationMember: table([{ userId: 'user-a', organizationId: 'org-a', role: 'admin' }]),
  };
  return { db, integrations, posts, syncs, reads: () => reads };
}

const webhook = 'src/app/api/integrations/github/webhook/route.ts';
const exporter = 'src/lib/integrations/github.ts';
const closedBody = JSON.stringify({ action: 'closed', issue: { number: 7 }, repository: { full_name: 'example/repo-b' } });
const secret = randomBytes(32).toString('hex');
const signature = (body: string, signingSecret = secret) => `sha256=${createHmac('sha256', signingSecret).update(body).digest('hex')}`;
function request(body: string, sig?: string, event = 'issues') {
  return new Request('https://app.example/api/webhook', {
    method: 'POST', body,
    headers: { 'x-github-event': event, ...(sig === undefined ? {} : { 'x-hub-signature-256': sig }) },
  });
}

for (const [name, sig, configured] of [
  ['missing signature', undefined, secret],
  ['wrong signature', `sha256=${'0'.repeat(64)}`, secret],
  ['short signature', 'sha256=00', secret],
  ['non-hex signature', `sha256=${'z'.repeat(64)}`, secret],
  ['missing signing secret', signature(closedBody), undefined],
  ['changed raw body', signature(`${closedBody} `), secret],
] as const) {
  test(`webhook rejects ${name} without changing posts`, async () => {
    const f = fixtures();
    if (!configured) f.integrations[1].config.webhookSecret = '';
    const { POST } = load(webhook, f.db, { secret: configured });
    assert.equal((await POST(request(closedBody, sig))).status, 401);
    assert.ok(f.posts.every((p) => p.statusId === 'open'));
  });
}

test('signed closure updates only the matching repository and integration', async () => {
  const f = fixtures();
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request(closedBody, signature(closedBody)))).status, 200);
  assert.deepEqual(f.posts.map((p) => p.statusId), ['open', 'complete-b']);
});

test('valid signature uses the exact raw body including whitespace', async () => {
  const f = fixtures();
  const raw = `\n ${closedBody}\n`;
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request(raw, signature(raw)))).status, 200);
  assert.equal(f.posts[1].statusId, 'complete-b');
});

test('a mapping for a previously configured repository cannot complete a post', async () => {
  const f = fixtures();
  f.syncs[1].externalUrl = 'https://github.com/example/old-repo/issues/7';
  const { POST } = load(webhook, f.db, { secret });
  await POST(request(closedBody, signature(closedBody)));
  assert.ok(f.posts.every((p) => p.statusId === 'open'));
});

test('disabled integrations cannot sync', async () => {
  const f = fixtures();
  f.integrations[1].isActive = false;
  const { POST } = load(webhook, f.db, { secret });
  await POST(request(closedBody, signature(closedBody)));
  assert.ok(f.posts.every((p) => p.statusId === 'open'));
});

for (const own of [false, true]) {
  test(`admin export ${own ? 'allows own organization' : 'denies another organization'}`, async () => {
    const f = fixtures();
    let exports = 0;
    const { POST } = load('src/app/api/integrations/github/issues/route.ts', f.db, {
      createIssue: async () => { exports++; return { issueNumber: 7, issueUrl: 'https://github.com/example/repo-a/issues/7' }; },
    });
    const response = await POST(request(JSON.stringify({ postId: f.posts[own ? 0 : 1].id })));
    assert.equal(response.status, own ? 201 : 404);
    assert.equal(exports, own ? 1 : 0);
  });
}

test('retry returns the existing issue without an outbound request or overwriting its mapping', async () => {
  const f = fixtures();
  let calls = 0;
  const { createGitHubIssue } = load(exporter, f.db, {
    fetch: async () => { calls++; return Response.json({ number: 8, html_url: 'https://github.com/example/repo-a/issues/8' }); },
  });
  const result = await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' });
  assert.equal(result.issueNumber, 7);
  assert.equal(calls, 0);
  assert.equal(f.syncs[0].externalId, '7');
});

test('concurrent exports reserve one mapping before creating one issue', async () => {
  const f = fixtures();
  f.syncs.length = 0;
  let calls = 0;
  const { createGitHubIssue } = load(exporter, f.db, {
    fetch: async (_url, options) => {
      calls++;
      assert.equal(options?.redirect, 'manual');
      return Response.json({ number: 7, html_url: 'https://github.com/example/repo-a/issues/7' });
    },
  });
  await Promise.all([1, 2].map(() => createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' })));
  assert.equal(calls, 1);
  assert.equal(f.syncs.length, 1);
  assert.equal(f.syncs[0].externalId, '7');
});

test('webhook refuses a legacy mapping pointing into another organization', async () => {
  const f = fixtures();
  f.syncs[1].entityId = f.posts[0].id;
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request(closedBody, signature(closedBody)))).status, 200);
  assert.ok(f.posts.every((p) => p.statusId === 'open'));
});

test('sync lookup keeps issue number and integration boundaries within one repository', async () => {
  const f = fixtures();
  f.integrations[0].config.repo = 'repo-b';
  f.integrations[0].config.repository = 'example/repo-b';
  f.posts.push({ ...f.posts[1], id: 'cm00000000000000000000003' });
  f.syncs.push({ ...f.syncs[1], id: 'sync-other-issue', entityId: f.posts[2].id, externalId: '8', externalUrl: 'https://github.com/example/repo-b/issues/8' });
  f.syncs[0].externalId = '8';
  f.syncs[0].externalUrl = 'https://github.com/example/repo-b/issues/8';
  const { POST } = load(webhook, f.db, { secret });
  await POST(request(closedBody, signature(closedBody)));
  assert.deepEqual(f.posts.map((p) => p.statusId), ['open', 'complete-b', 'open']);
});

test('repository matching is case insensitive', async () => {
  const f = fixtures();
  f.integrations[1].config.owner = 'Example';
  f.syncs[1].externalUrl = 'https://github.com/Example/Repo-B/issues/7';
  const { POST } = load(webhook, f.db, { secret });
  await POST(request(closedBody, signature(closedBody)));
  assert.deepEqual(f.posts.map((p) => p.statusId), ['open', 'complete-b']);
});

test('signed event without repository identity is rejected before database access', async () => {
  const f = fixtures();
  const body = JSON.stringify({ action: 'closed', issue: { number: 7 } });
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request(body, signature(body)))).status, 400);
  assert.equal(f.reads(), 0);
});

for (const failure of ['network', 'invalid-body', 'database'] as const) {
  test(`uncertain ${failure} result cannot create a duplicate on retry`, async () => {
    const f = fixtures();
    f.syncs.length = 0;
    let calls = 0;
    if (failure === 'database') {
      f.db.integrationSync.update = async () => { throw new Error('Simulated persistence failure'); };
    }
    const { createGitHubIssue } = load(exporter, f.db, {
      fetch: async (_url, options) => {
        calls++;
        assert.equal(options?.redirect, 'manual');
        if (failure === 'network') throw new Error('Simulated lost response');
        if (failure === 'invalid-body') return Response.json({});
        return Response.json({ number: 7 });
      },
    });
    for (let i = 0; i < 2; i++) {
      assert.equal(await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' }), null);
    }
    assert.equal(calls, 1);
    assert.equal(f.syncs.length, 1);
    assert.equal(f.syncs[0].status, 'pending');
  });
}

for (const repo of ['..', '../other/issues', 'repo?redirect=elsewhere', 'repo#fragment']) {
  test(`unsafe repository component is rejected: ${repo}`, async () => {
    const f = fixtures();
    f.syncs.length = 0;
    f.integrations[0].config.repo = repo;
    let calls = 0;
    const { createGitHubIssue } = load(exporter, f.db, {
      fetch: async () => { calls++; return Response.json({ number: 7 }); },
    });
    assert.equal(await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' }), null);
    assert.equal(calls, 0);
    assert.equal(f.syncs.length, 0);
  });
}

test('new export uses the HTTPS API allowlist and its original link still syncs after retry', async () => {
  const f = fixtures();
  f.syncs.length = 0;
  let calls = 0;
  const { createGitHubIssue } = load(exporter, f.db, {
    fetch: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://api.github.com/repos/example/repo-b/issues');
      assert.equal(options?.redirect, 'manual');
      return Response.json({ number: 7 });
    },
  });
  const first = await createGitHubIssue('org-b', f.posts[1].id, { title: 'Feedback', body: 'Details' });
  const retry = await createGitHubIssue('org-b', f.posts[1].id, { title: 'Feedback', body: 'Details' });
  assert.equal(calls, 1);
  assert.equal(first.issueUrl, 'https://github.com/example/repo-b/issues/7');
  assert.equal(retry.issueUrl, first.issueUrl);
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request(closedBody, signature(closedBody)))).status, 200);
  assert.deepEqual(f.posts.map((p) => p.statusId), ['open', 'complete-b']);
});

// Round 2: tenant authentication and recoverable export failures.
const configRoute = 'src/app/api/integrations/github/route.ts';

test('a tenant secret cannot sign a closure for another tenant repository', async () => {
  const f = fixtures();
  const attackerSecret = f.integrations[0].config.webhookSecret;
  // Even an old global secret equal to the attacker's secret must not authorize it.
  const { POST } = load(webhook, f.db, { secret: attackerSecret });
  const response = await POST(request(closedBody, signature(closedBody, attackerSecret)));
  assert.equal(response.status, 401);
  assert.ok(f.posts.every((p) => p.statusId === 'open'));
});

test('integration secret works without a global secret and authenticates only its own integration', async () => {
  const f = fixtures();
  f.integrations[0].config.repo = 'repo-b';
  f.integrations[0].config.repository = 'example/repo-b';
  f.syncs[0].externalUrl = f.syncs[1].externalUrl;
  const { POST } = load(webhook, f.db);
  assert.equal((await POST(request(closedBody, signature(closedBody)))).status, 200);
  assert.deepEqual(f.posts.map((p) => p.statusId), ['open', 'complete-b']);
});

test('saving a connection generates and rotates a copy-once secret without returning the token', async () => {
  const f = fixtures();
  const { POST, GET } = load(configRoute, f.db);
  const suppliedSecret = randomBytes(32).toString('hex');
  const token = randomBytes(32).toString('hex');
  let previous = f.integrations[0].config.webhookSecret;
  for (let i = 0; i < 2; i++) {
    const response = await POST(request(JSON.stringify({ accessToken: token, owner: 'Example', repo: 'Repo-A', webhookSecret: suppliedSecret })));
    assert.equal(response.status, 201);
    const { integration, secret } = await response.json();
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(secret, /^[a-f0-9]{64}$/);
    assert.notEqual(secret, suppliedSecret);
    assert.notEqual(secret, previous);
    assert.deepEqual(Object.keys(integration).sort(), ['config', 'createdAt', 'id', 'isActive', 'organizationId', 'type', 'updatedAt']);
    assert.equal(integration.createdAt, f.integrations[0].createdAt.toISOString());
    assert.equal(integration.updatedAt, f.integrations[0].updatedAt.toISOString());
    for (const fragment of [previous, previous.slice(0, 10), token, token.slice(0, 10)]) {
      assert.equal(JSON.stringify(integration).includes(fragment), false);
    }
    assert.equal(integration.config.webhookSecret, undefined);
    assert.equal(integration.config.hasSecret, true);
    assert.equal(integration.config.repository, 'example/repo-a');
    assert.equal(integration.config.accessToken, undefined);
    const read = await (await GET()).json();
    assert.deepEqual(Object.keys(read.integration).sort(), Object.keys(integration).sort());
    assert.equal(read.integration.createdAt, integration.createdAt);
    assert.equal(read.integration.updatedAt, integration.updatedAt);
    assert.equal(read.integration.config.webhookSecret, undefined);
    assert.equal(read.integration.config.hasSecret, true);
    assert.equal(read.secret, undefined);
    for (const fragment of [secret, secret.slice(0, 10), previous, previous.slice(0, 10)]) {
      assert.equal(JSON.stringify(read).includes(fragment), false);
    }
    assert.equal(read.integration.config.accessToken, undefined);
    assert.equal(read.integration.organizationId, 'org-a');
    previous = secret;
  }
});

for (const status of [302, 401, 404, 410, 422, 500, 503]) {
  test(`HTTP ${status} releases the reservation so a corrected export can retry`, async () => {
    const f = fixtures();
    f.syncs.length = 0;
    let calls = 0;
    const { createGitHubIssue } = load(exporter, f.db, {
      fetch: async () => ++calls === 1
        ? new Response('not JSON', { status })
        : Response.json({ number: 8 }),
    });
    assert.equal(await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' }), null);
    assert.equal(f.syncs.length, 0);
    const retry = await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' });
    assert.equal(retry.issueNumber, 8);
    assert.equal(calls, 2);
    assert.equal(f.syncs[0].status, 'synced');
  });
}

for (const input of [{ owner: 'bad?owner', repo: 'repo' }, { owner: 'example', repo: 'bad?repo' }, { owner: 'example', repo: '..' }]) {
  test(`config save rejects unsafe repository ${JSON.stringify(input)}`, async () => {
    const f = fixtures();
    const original = JSON.stringify(f.integrations);
    const { POST } = load(configRoute, f.db);
    const response = await POST(request(JSON.stringify({ ...input, accessToken: randomBytes(16).toString('hex') })));
    assert.equal(response.status, 400);
    assert.equal(JSON.stringify(f.integrations), original);
  });
}

test('malformed JSON returns 400 without writes', async () => {
  const f = fixtures();
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request('{', signature('{')))).status, 400);
  assert.ok(f.posts.every((p) => p.statusId === 'open'));
});

test('an existing mapping retains its original issue after changing repositories', async () => {
  const f = fixtures();
  f.integrations[0].config.repo = 'new-repo';
  const { createGitHubIssue } = load(exporter, f.db);
  const result = await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' });
  assert.equal(result.issueUrl, 'https://github.com/example/repo-a/issues/7');
});

for (const issueNumber of [8, null]) {
  test(`admin can resolve a stale pending export after checking GitHub: ${issueNumber ?? 'confirmed absent'}`, async () => {
    const f = fixtures();
    f.syncs[0].status = 'pending';
    f.syncs[0].externalId = '';
    f.syncs[0].externalUrl = null;
    f.syncs[0].createdAt = new Date(Date.now() - 60 * 60 * 1000);
    const untouched = JSON.stringify(f.syncs[1]);
    const calls: string[] = [];
    const { POST } = load('src/app/api/integrations/github/issues/route.ts', f.db, {
      fetch: async (url, options) => {
        calls.push(`${options?.method} ${url}`);
        if (options?.method === 'GET') {
          assert.equal(String(url), 'https://api.github.com/repos/example/repo-a/issues/8');
          return Response.json({ number: 8 });
        }
        return Response.json({ number: 9 });
      },
    });
    const response = await POST(request(JSON.stringify({
      postId: f.posts[0].id, resolvePending: { issueNumber, confirmed: true },
    })));
    assert.equal(response.status, 201);
    const result = await response.json();
    assert.equal(result.issueNumber, issueNumber ?? 9);
    assert.equal(calls.length, 1);
    assert.equal(JSON.stringify(f.syncs.find((s) => s.integrationId === 'integration-b')), untouched);
    assert.equal(f.syncs.find((s) => s.integrationId === 'integration-a').status, 'synced');
  });
}

for (const failure of ['recent', 'http', 'network', 'pull-request', 'wrong-number', 'other-org'] as const) {
  test(`pending recovery refuses ${failure} and preserves its reservation`, async () => {
    const f = fixtures();
    f.syncs[0].status = 'pending';
    f.syncs[0].createdAt = new Date(Date.now() - (failure === 'recent' ? 0 : 60 * 60 * 1000));
    let calls = 0;
    const { POST } = load('src/app/api/integrations/github/issues/route.ts', f.db, {
      fetch: async () => {
        calls++;
        if (failure === 'network') throw new Error('Lost response');
        if (failure === 'http') return Response.json({}, { status: 404 });
        return Response.json({ number: failure === 'wrong-number' ? 9 : 8, ...(failure === 'pull-request' ? { pull_request: {} } : {}) });
      },
    });
    const response = await POST(request(JSON.stringify({
      postId: f.posts[failure === 'other-org' ? 1 : 0].id,
      resolvePending: { issueNumber: 8, confirmed: true },
    })));
    assert.equal(response.status, failure === 'other-org' ? 404 : 500);
    assert.equal(f.syncs[0].status, 'pending');
    assert.equal(calls, failure === 'recent' || failure === 'other-org' ? 0 : 1);
  });
}

test('pending recovery requires explicit confirmation', async () => {
  const f = fixtures();
  const { POST } = load('src/app/api/integrations/github/issues/route.ts', f.db);
  const response = await POST(request(JSON.stringify({ postId: f.posts[0].id, resolvePending: { issueNumber: null } })));
  assert.equal(response.status, 400);
});

for (const access of ['anonymous', 'member'] as const) {
  test(`${access} cannot read or rotate an integration secret`, async () => {
    const f = fixtures();
    if (access === 'member') f.db.organizationMember.findFirst = async () => null;
    const { GET, POST } = load(configRoute, f.db, { authenticated: access !== 'anonymous' });
    assert.equal((await GET()).status, access === 'anonymous' ? 401 : 403);
    assert.equal((await POST(request('{}'))).status, access === 'anonymous' ? 401 : 403);
  });
}

test('HTTP failure logs GitHub message and releases only its own reservation', async () => {
  const f = fixtures();
  f.syncs.splice(0, 1);
  const errors: unknown[][] = [];
  const { createGitHubIssue } = load(exporter, f.db, {
    errors, fetch: async () => Response.json({ message: 'Issues are disabled' }, { status: 410 }),
  });
  await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' });
  assert.ok(errors.some((args) => args.includes('Issues are disabled')));
  assert.equal(f.syncs.length, 1);
  assert.equal(f.syncs[0].integrationId, 'integration-b');
});

test('an old global secret cannot authenticate an integration without its own secret', async () => {
  const f = fixtures();
  f.integrations[1].config.webhookSecret = '';
  const { POST } = load(webhook, f.db, { secret });
  assert.equal((await POST(request(closedBody, signature(closedBody)))).status, 401);
  assert.ok(f.posts.every((p) => p.statusId === 'open'));
});

test('rotating a connection invalidates its previous webhook secret', async () => {
  const f = fixtures();
  const previous = f.integrations[0].config.webhookSecret;
  const save = load(configRoute, f.db).POST;
  assert.equal((await save(request(JSON.stringify({ owner: 'EXAMPLE', repo: 'REPO-A', accessToken: randomBytes(16).toString('hex') })))).status, 201);
  const body = closedBody.replace('example/repo-b', 'EXAMPLE/REPO-A');
  const { POST } = load(webhook, f.db);
  assert.equal((await POST(request(body, signature(body, previous)))).status, 401);
  assert.equal((await POST(request(body, signature(body, f.integrations[0].config.webhookSecret)))).status, 200);
  assert.deepEqual(f.posts.map((p) => p.statusId), ['complete-a', 'open']);
});

test('a new connection receives an independent server-generated secret', async () => {
  const f = fixtures();
  f.integrations.splice(0, 1);
  const { POST } = load(configRoute, f.db);
  const response = await POST(request(JSON.stringify({ owner: 'example', repo: 'repo-a', accessToken: randomBytes(16).toString('hex') })));
  assert.equal(response.status, 201);
  const { integration, secret } = await response.json();
  assert.equal(integration.organizationId, 'org-a');
  assert.match(secret, /^[a-f0-9]{64}$/);
  assert.notEqual(secret, f.integrations[0].config.webhookSecret);
  assert.equal(integration.config.webhookSecret, undefined);
  assert.equal(integration.config.hasSecret, true);
});

test('age alone never releases an ambiguous reservation', async () => {
  const f = fixtures();
  f.syncs[0].status = 'pending';
  f.syncs[0].createdAt = new Date(0);
  let calls = 0;
  const { createGitHubIssue } = load(exporter, f.db, { fetch: async () => { calls++; return Response.json({ number: 8 }); } });
  assert.equal(await createGitHubIssue('org-a', f.posts[0].id, { title: 'Feedback', body: 'Details' }), null);
  assert.equal(f.syncs[0].status, 'pending');
  assert.equal(calls, 0);
});

test('concurrent confirmed recoveries reserve only one replacement export', async () => {
  const f = fixtures();
  f.syncs[0].status = 'pending';
  f.syncs[0].createdAt = new Date(0);
  let calls = 0;
  const { createGitHubIssue } = load(exporter, f.db, {
    fetch: async () => { calls++; return Response.json({ number: 8 }); },
  });
  await Promise.all([1, 2].map(() => createGitHubIssue('org-a', f.posts[0].id,
    { title: 'Feedback', body: 'Details' }, { issueNumber: null, confirmed: true })));
  assert.equal(calls, 1);
  assert.equal(f.syncs.length, 2);
  assert.equal(f.syncs.find((s) => s.integrationId === 'integration-a').externalId, '8');
});

test('recovery verifies an issue in the original repository after config changes', async () => {
  const f = fixtures();
  f.syncs[0].status = 'pending';
  f.syncs[0].createdAt = new Date(0);
  f.syncs[0].metadata = { repository: 'example/original-repo' };
  const { createGitHubIssue } = load(exporter, f.db, {
    fetch: async (url, options) => {
      assert.equal(options?.method, 'GET');
      assert.equal(options?.redirect, 'manual');
      assert.equal(String(url), 'https://api.github.com/repos/example/original-repo/issues/8');
      return Response.json({ number: 8 });
    },
  });
  const result = await createGitHubIssue('org-a', f.posts[0].id,
    { title: 'Feedback', body: 'Details' }, { issueNumber: 8, confirmed: true });
  assert.equal(result.issueUrl, 'https://github.com/example/original-repo/issues/8');
});


test('GitHub status webhooks include the old/new status once and skip conflicting writes', async () => {
  for (const conflict of [false, true]) {
    const f = fixtures();
    const webhooks: unknown[][] = [];
    if (conflict) f.db.post.updateMany = async () => ({ count: 0 });
    const { POST } = load(webhook, f.db, { webhooks });
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await POST(request(closedBody, signature(closedBody)))).status, 200);
    }
    assert.deepEqual(webhooks, conflict ? [] : [['org-b', 'post.status_changed', {
      postId: f.posts[1].id, oldStatusId: 'open', newStatusId: 'complete-b',
    }]]);
  }
});
