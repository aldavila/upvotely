import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';
import { loadSource } from './load-source';

const secret = randomBytes(32).toString('hex');
const webhookFile = 'src/app/api/integrations/linear/webhook/route.ts';
const issueFile = 'src/app/api/integrations/linear/issues/route.ts';
const helperFile = 'src/lib/integrations/linear.ts';
const postId = 'c1234567890123456789012345';
const payload = (timestamp = Date.now()) => ({
  type: 'Issue', action: 'update', webhookTimestamp: timestamp,
  data: { id: 'immutable-a', identifier: 'TEAM-1', team: { id: 'team-a' }, state: { type: 'completed' } },
});
function webhookRequest(body: string, signature: string | null = createHmac('sha256', secret).update(body).digest('hex')) {
  return new Request('https://app.example/api/integrations/linear/webhook', {
    method: 'POST', body, headers: signature === null ? {} : { 'Linear-Signature': signature },
  });
}
function webhook(db: unknown, signingSecret: string | undefined = secret) {
  return loadSource(webhookFile, { '@/lib/db': { db } }, {
    process: { env: { LINEAR_WEBHOOK_SIGNING_SECRET: signingSecret } },
  }).POST as (req: Request) => Promise<Response>;
}

for (const variant of ['missing', 'invalid', 'short', 'non-hex', 'tampered', 'stale', 'future', 'no timestamp', 'no secret']) {
  test(`webhook rejects ${variant} authentication before any DB access`, async () => {
    let reads = 0;
    const db = new Proxy({}, { get() { reads++; throw new Error('DB must not be accessed'); } });
    const event: Record<string, unknown> = payload(variant === 'stale' ? Date.now() - 301_000 : variant === 'future' ? Date.now() + 301_000 : Date.now());
    if (variant === 'no timestamp') delete event.webhookTimestamp;
    let body = JSON.stringify(event);
    let signature: string | null = createHmac('sha256', secret).update(body).digest('hex');
    if (variant === 'missing') signature = null;
    if (variant === 'invalid') signature = '0'.repeat(64);
    if (variant === 'short') signature = '00';
    if (variant === 'non-hex') signature = 'z'.repeat(64);
    if (variant === 'tampered') body += ' ';
    const response = await webhook(db, variant === 'no secret' ? '' : secret)(webhookRequest(body, signature));
    assert.equal(response.status, 401);
    assert.equal(reads, 0);
  });
}

type Row = { id: string; externalId: string; entityId: string; entityType: string; metadata: { linearIssueId: string }; integration: { id: string; type: string; isActive: boolean; organizationId: string; config: { teamId: string }; organization: { statuses: { id: string; type: string }[] } } };
function sync(id: string, issueId: string, teamId: string, organizationId = id): Row {
  return { id, externalId: 'TEAM-1', entityId: `post-${id}`, entityType: 'post', metadata: { linearIssueId: issueId },
    integration: { id: `integration-${id}`, type: 'linear', isActive: true, organizationId, config: { teamId }, organization: { statuses: [{ id: `complete-${id}`, type: 'complete' }] } } };
}
// Small in-memory evaluator for the Prisma equality/JSON-path filters used here.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (value && typeof value === 'object') {
      if (value.path) return value.path.reduce((obj: any, part: string) => obj?.[part], row[key]) === value.equals;
      if (value.in) return value.in.includes(row[key]);
      return matches(row[key], value);
    }
    return row[key] === value;
  });
}
function webhookDb(rows: Row[], postOrg?: string) {
  const posts = rows.map(row => ({ id: row.entityId, board: { organizationId: postOrg ?? row.integration.organizationId }, statusId: 'open' }));
  const db = {
    integrationSync: {
      findFirst: async ({ where }: any) => rows.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }: any) => rows.filter(row => matches(row, where)),
      update: async () => ({}),
    },
    post: {
      update: async ({ where, data }: any) => { const post = posts.find(row => matches(row, where)); if (!post) throw new Error('Not found'); Object.assign(post, data); return post; },
      updateMany: async ({ where, data }: any) => { const found = posts.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length }; },
    },
  };
  return { db, posts };
}

test('signed raw body updates only the immutable issue in its active Linear integration', async () => {
  const inactive = sync('inactive', 'immutable-a', 'team-a'); inactive.integration.isActive = false;
  const otherType = sync('other-type', 'immutable-a', 'team-a'); otherType.integration.type = 'github';
  const { db, posts } = webhookDb([
    sync('collision', 'immutable-other', 'team-other'), sync('foreign-team', 'immutable-a', 'team-other'),
    inactive, otherType, sync('correct', 'immutable-a', 'team-a'),
  ]);
  // Whitespace deliberately differs from JSON.stringify: verification must use raw bytes.
  const response = await webhook(db)(webhookRequest(JSON.stringify(payload(), null, 2)));
  assert.equal(response.status, 200);
  assert.deepEqual(posts.map(post => post.statusId), ['open', 'open', 'open', 'open', 'complete-correct']);
});

test('webhook cannot use an old cross-organization mapping to modify a foreign post', async () => {
  const { db, posts } = webhookDb([sync('correct', 'immutable-a', 'team-a')], 'foreign-org');
  const response = await webhook(db)(webhookRequest(JSON.stringify(payload())));
  assert.equal(response.status, 200);
  assert.equal(posts[0].statusId, 'open');
});

for (const sameOrg of [false, true]) {
  test(`issue export ${sameOrg ? 'allows same-org admin' : 'rejects foreign-org post before export'}`, async () => {
    let exports = 0;
    const post = { id: postId, title: 'Feedback', content: 'Description', voteCount: 1, board: { organizationId: sameOrg ? 'org-a' : 'org-b', name: 'Board' }, status: { name: 'Open' } };
    const findPost = async ({ where }: any) => matches(post, where) ? post : null;
    const db = { organizationMember: { findFirst: async () => ({ organizationId: 'org-a', role: 'admin' }) }, post: { findUnique: findPost, findFirst: findPost } };
    const { POST } = loadSource(issueFile, {
      '@/lib/db': { db }, '@/lib/auth': { auth: async () => ({ user: { id: 'user-a' } }) },
      '@/lib/integrations/linear': { createLinearIssue: async () => { exports++; return { issueId: 'issue-a' }; } },
    });
    const response = await POST(new Request('https://app.example/api/integrations/linear/issues', { method: 'POST', body: JSON.stringify({ postId }) }));
    assert.equal(response.status, sameOrg ? 201 : 404);
    assert.equal(exports, sameOrg ? 1 : 0);
  });
}

test('retry returns existing mapping without creating another issue or overwriting its link', async () => {
  let creates = 0;
  let mapping: any = null;
  const db = {
    integration: { findUnique: async () => ({ id: 'integration-a', isActive: true, config: { apiKey: '', teamId: 'team-a' } }) },
    integrationSync: {
      findUnique: async () => mapping,
      upsert: async ({ create, update }: any) => { mapping = mapping ? { ...mapping, ...update } : create; return mapping; },
    },
  };
  Object.assign(db, { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ ...db, $executeRaw: async () => 1 }) });
  const { createLinearIssue } = loadSource(helperFile, { '@/lib/db': { db } }, {
    fetch: async () => { creates++; return Response.json({ data: { issueCreate: { success: true, issue: { id: `immutable-${creates}`, identifier: `TEAM-${creates}`, url: `https://linear.app/example/issue/TEAM-${creates}` } } } }); },
  });
  const first = await createLinearIssue('org-a', postId, { title: 'Feedback', description: 'Text' });
  const retry = await createLinearIssue('org-a', postId, { title: 'Feedback', description: 'Text' });
  assert.equal(creates, 1);
  assert.deepEqual(retry, first);
  assert.equal(mapping.metadata.linearIssueId, 'immutable-1');
});

test('Linear API requests use the fixed HTTPS endpoint and never follow redirects', async () => {
  let options: RequestInit | undefined;
  let destination: string | undefined;
  const db = {
    integration: { findUnique: async () => ({ id: 'integration-a', isActive: true, config: { apiKey: '', teamId: 'team-a' } }) },
    integrationSync: { findUnique: async () => null, upsert: async () => { throw new Error('No mapping on redirect'); } },
  };
  Object.assign(db, { $transaction: async (work: (tx: unknown) => Promise<unknown>) => work({ ...db, $executeRaw: async () => 1 }) });
  const { createLinearIssue } = loadSource(helperFile, { '@/lib/db': { db } }, {
    fetch: async (url: string, init: RequestInit) => { destination = url; options = init; return new Response(null, { status: 302, headers: { Location: 'https://redirect.example/' } }); },
  });
  assert.equal(await createLinearIssue('org-a', postId, { title: 'Feedback', description: 'Text' }), null);
  assert.equal(destination, 'https://api.linear.app/graphql');
  assert.equal(options?.redirect, 'manual');
});

test('signed completion with a flat teamId updates the matching integration', async () => {
  const { db, posts } = webhookDb([sync('correct', 'immutable-a', 'team-a')]);
  const event = payload();
  const { team, ...data } = event.data;
  const response = await webhook(db)(webhookRequest(JSON.stringify({ ...event, data: { ...data, teamId: team.id } })));
  assert.equal(response.status, 200);
  assert.equal(posts[0].statusId, 'complete-correct');
});

test('concurrent first exports create one issue and keep one stable mapping', async () => {
  let creates = 0;
  let mapping: any = null;
  let queue = Promise.resolve();
  const db = {
    integration: { findUnique: async () => ({ id: 'integration-a', isActive: true, config: { apiKey: '', teamId: 'team-a' } }) },
    integrationSync: {
      findUnique: async () => mapping,
      upsert: async ({ create, update }: any) => { mapping = mapping ? { ...mapping, ...update } : create; return mapping; },
    },
    $transaction: async (work: (tx: any) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      const tx = { ...db, $executeRaw: async () => {
        const previous = queue;
        queue = new Promise<void>(resolve => { release = resolve; });
        await previous;
      } };
      try { return await work(tx); } finally { release?.(); }
    },
  };
  const { createLinearIssue } = loadSource(helperFile, { '@/lib/db': { db } }, {
    fetch: async () => {
      const number = ++creates;
      await new Promise(resolve => setImmediate(resolve));
      return Response.json({ data: { issueCreate: { success: true, issue: { id: `immutable-${number}`, identifier: `TEAM-${number}`, url: `https://linear.app/example/issue/TEAM-${number}` } } } });
    },
  });
  const [first, second] = await Promise.all([
    createLinearIssue('org-a', postId, { title: 'Feedback', description: 'Text' }),
    createLinearIssue('org-a', postId, { title: 'Feedback', description: 'Text' }),
  ]);
  assert.equal(creates, 1);
  assert.ok(first);
  assert.deepEqual(first, second);
  assert.equal(mapping.metadata.linearIssueId, first.issueId);
});
