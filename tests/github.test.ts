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
} = {}): any {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(resolve(file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    module, exports: module.exports, Buffer, URL, Response,
    console: { error() {} },
    process: { env: { GITHUB_WEBHOOK_SECRET: options.secret } },
    fetch: options.fetch ?? (() => { throw new Error('Unexpected network call'); }),
    require(name: string) {
      if (name === '@/lib/db') return { db };
      if (name === 'next/server') return { NextResponse: Response };
      if (name === '@/lib/auth') return { auth: async () => ({ user: { id: 'user-a' } }) };
      if (name === 'zod') return { z };
      if (name === 'node:crypto') return require('node:crypto');
      if (name === '@/lib/github-security' || name === '../github-security') {
        return load('src/lib/github-security.ts', db, options);
      }
      if (name === '@/lib/integrations/github' && options.createIssue) {
        return { createGitHubIssue: options.createIssue };
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
    id: `integration-${key}`, organizationId: `org-${key}`, type: 'github', isActive: true,
    config: { owner: 'example', repo: `repo-${key}`, accessToken: '' },
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
        const row = { id: `new-${rows.length}`, ...data };
        rows.push(row);
        return row;
      },
      async update({ where, data }: any) {
        const row = rows.find((r) => matches(r, where));
        if (!row) throw new Error('Not found');
        Object.assign(row, data);
        return row;
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
const signature = (body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
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
  test(`webhook rejects ${name} before any database access`, async () => {
    const f = fixtures();
    const { POST } = load(webhook, f.db, { secret: configured });
    assert.equal((await POST(request(closedBody, sig))).status, 401);
    assert.equal(f.reads(), 0);
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
  f.syncs[0].externalId = '8';
  f.syncs[0].externalUrl = 'https://github.com/example/repo-b/issues/8';
  const { POST } = load(webhook, f.db, { secret });
  await POST(request(closedBody, signature(closedBody)));
  assert.deepEqual(f.posts.map((p) => p.statusId), ['open', 'complete-b']);
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

for (const failure of ['network', 'redirect', 'database'] as const) {
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
        if (failure === 'redirect') return new Response(null, { status: 302, headers: { location: 'https://elsewhere.example/' } });
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
