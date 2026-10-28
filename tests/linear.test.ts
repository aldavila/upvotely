import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import test from 'node:test';
import { loadSource } from './load-source';

const secret = randomBytes(32).toString('hex');
const webhookFile = 'src/app/api/integrations/linear/webhook/route.ts';
const issueFile = 'src/app/api/integrations/linear/issues/route.ts';
const configFile = 'src/app/api/integrations/linear/route.ts';
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
function webhook(db: unknown, signingSecret: string | undefined = secret, webhooks: unknown[][] = []) {
  return loadSource(webhookFile, { '@/lib/db': { db }, '@/lib/webhooks/emit': { emitWebhook: (...args: unknown[]) => webhooks.push(JSON.parse(JSON.stringify(args))) } }, {
    process: { env: { LINEAR_WEBHOOK_SIGNING_SECRET: signingSecret } },
  }).POST as (req: Request) => Promise<Response>;
}

for (const variant of ['missing', 'invalid', 'short', 'non-hex', 'tampered', 'stale', 'future', 'no timestamp', 'no secret']) {
  test(`webhook rejects ${variant} authentication before any sync or post access`, async () => {
    let reads = 0;
    const candidate = sync('candidate', 'immutable-a', 'team-a');
    if (variant === 'no secret') delete candidate.integration.config.webhookSecret;
    const db = new Proxy({ integration: { findMany: async () => [candidate.integration] } }, {
      get(target, key) {
        if (key === 'integration') return target.integration;
        reads++; throw new Error('Sync and posts must not be accessed');
      },
    });
    const event: Record<string, unknown> = payload(variant === 'stale' ? Date.now() - 61_000 : variant === 'future' ? Date.now() + 61_000 : Date.now());
    if (variant === 'no timestamp') delete event.webhookTimestamp;
    let body = JSON.stringify(event);
    let signature: string | null = createHmac('sha256', secret).update(body).digest('hex');
    if (variant === 'missing') signature = null;
    if (variant === 'invalid') signature = '0'.repeat(64);
    if (variant === 'short') signature = '00';
    if (variant === 'non-hex') signature = 'z'.repeat(64);
    if (variant === 'tampered') body += ' ';
    const response = await webhook(db)(webhookRequest(body, signature));
    assert.equal(response.status, 401);
    assert.equal(reads, 0);
  });
}

type Row = { integrationId: string; id: string; externalId: string; entityId: string; entityType: string; metadata: { linearIssueId: string }; integration: { id: string; type: string; isActive: boolean; organizationId: string; config: { teamId: string; webhookSecret?: string }; organization: { statuses: { id: string; type: string }[] } } };
function sync(id: string, issueId: string, teamId: string, organizationId = id): Row {
  return { integrationId: `integration-${id}`, id, externalId: 'TEAM-1', entityId: `post-${id}`, entityType: 'post', metadata: { linearIssueId: issueId },
    integration: { id: `integration-${id}`, type: 'linear', isActive: true, organizationId, config: { teamId, webhookSecret: secret }, organization: { statuses: [{ id: `complete-${id}`, type: 'complete' }] } } };
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
    integration: { findMany: async ({ where }: any) => rows.map(row => row.integration).filter(row => matches(row, where)) },
    integrationSync: {
      findFirst: async ({ where }: any) => rows.find(row => matches(row, where)) ?? null,
      findMany: async ({ where }: any) => rows.filter(row => matches(row, where)),
      update: async (_query: any) => ({}),
    },
    post: {
      findFirst: async ({ where }: any) => posts.find(row => matches(row, where)) ?? null,
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

for (const teamId of ['team-a', 'team-b']) {
  test(`tenant-specific secret authorizes only its integration (${teamId}) without a global secret`, async () => {
    const tenantBSecret = randomBytes(32).toString('hex');
    const tenantA = sync('tenant-a', 'immutable-a', 'team-a');
    const tenantB = sync('tenant-b', 'immutable-a', teamId);
    tenantB.integration.config.webhookSecret = tenantBSecret;
    const { db, posts } = webhookDb([tenantA, tenantB]);
    const event = payload();
    event.data.team.id = teamId;
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', tenantBSecret).update(body).digest('hex');
    const response = await webhook(db, '')(webhookRequest(body, signature));
    assert.equal(response.status, 200);
    assert.deepEqual(posts.map(post => post.statusId), ['open', 'complete-tenant-b']);
  });
}

test("tenant A's signature cannot authorize tenant B's team even if it matches the legacy global secret", async () => {
  const tenantA = sync('tenant-a', 'immutable-a', 'team-a');
  const tenantB = sync('tenant-b', 'immutable-a', 'team-b');
  tenantB.integration.config.webhookSecret = randomBytes(32).toString('hex');
  const { db, posts } = webhookDb([tenantA, tenantB]);
  const event = payload();
  event.data.team.id = 'team-b';
  const response = await webhook(db)(webhookRequest(JSON.stringify(event)));
  assert.equal(response.status, 401);
  assert.deepEqual(posts.map(post => post.statusId), ['open', 'open']);
});

test('webhook timestamp window includes 60 seconds and excludes 61 seconds in both directions', () => {
  const { isFreshLinearTimestamp } = loadSource('src/lib/linear-security.ts', {});
  const now = 1_000_000;
  for (const direction of [-1, 1]) {
    assert.equal(isFreshLinearTimestamp(now + direction * 60_000, now), true);
    assert.equal(isFreshLinearTimestamp(now + direction * 61_000, now), false);
  }
});

function configRoutes() {
  let saved: any = null;
  const db = {
    organizationMember: { findFirst: async () => ({ organizationId: 'org-a', role: 'admin' }) },
    integration: {
      findUnique: async () => saved,
      upsert: async ({ create, update }: any) => {
        saved = saved ? { ...saved, ...update } : { id: 'integration-a', ...create };
        return saved;
      },
    },
  };
  const routes = loadSource(configFile, { '@/lib/db': { db }, '@/lib/auth': { auth: async () => ({ user: { id: 'user-a' } }) } });
  return { routes, saved: () => saved };
}
const configRequest = (config: unknown) => new Request('https://app.example/api/integrations/linear', {
  method: 'POST', body: JSON.stringify(config),
});

test('settings persist and rotate per-integration secrets without returning credentials', async () => {
  const { routes, saved } = configRoutes();
  const apiKey = randomBytes(32).toString('hex');
  for (const webhookSecret of [secret, randomBytes(32).toString('hex')]) {
    const response = await routes.POST(configRequest({ apiKey, teamId: 'team-a', webhookSecret }));
    assert.equal(response.status, 201);
    assert.equal(saved().config.webhookSecret, webhookSecret);
    const config = (await response.json()).integration.config;
    assert.equal(config.webhookSecret, undefined);
    assert.equal(config.apiKey, undefined);
    const readConfig = (await (await routes.GET()).json()).integration.config;
    assert.equal(readConfig.webhookSecret, undefined);
    assert.equal(readConfig.apiKey, undefined);
    assert.equal(readConfig.teamId, 'team-a');
  }
});

for (const webhookSecret of [undefined, '']) {
  test(`settings reject ${webhookSecret === undefined ? 'missing' : 'empty'} webhook secrets`, async () => {
    const { routes, saved } = configRoutes();
    const response = await routes.POST(configRequest({ apiKey: randomBytes(32).toString('hex'), teamId: 'team-a', webhookSecret }));
    assert.equal(response.status, 400);
    assert.equal(saved(), null);
  });
}


for (const scenario of ['replay', 'already complete', 'race completes', 'race changes status', 'second race loses', 'post disappears']) {
  test(`Linear completion handles ${scenario} without duplicate or dropped events`, async () => {
    const syncRow = sync('correct', 'immutable-a', 'team-a');
    const { db, posts } = webhookDb([syncRow]);
    const post = posts[0];
    const webhooks: unknown[][] = [];
    const metadataUpdates: any[] = [];
    const priorMetadata = { ...syncRow.metadata, preserved: 'existing value', completedAt: 'old timestamp' };
    syncRow.metadata = priorMetadata;
    const findPost = db.post.findFirst;
    const updatePost = db.post.updateMany;
    let reads = 0;
    let writes = 0;
    db.post.findFirst = async (query: any) => {
      reads++;
      if (scenario === 'post disappears' && reads === 2) return null;
      const found = await findPost(query);
      // Prisma returns a snapshot, not a reference to the mutable test row.
      return found ? { ...found } : null;
    };
    db.post.updateMany = async (query: any) => {
      writes++;
      assert.equal(query.where.statusId, writes === 1 ? 'open' : 'in-progress');
      assert.equal(query.where.board.organizationId, 'correct');
      if (scenario === 'race completes') {
        post.statusId = 'complete-correct';
        return { count: 0 };
      }
      if (['race changes status', 'second race loses', 'post disappears'].includes(scenario) && writes === 1) {
        post.statusId = 'in-progress';
        return { count: 0 };
      }
      if (scenario === 'second race loses') return { count: 0 };
      return updatePost(query);
    };
    db.integrationSync.update = async (query: any) => { metadataUpdates.push(query); return syncRow; };
    if (scenario === 'already complete') post.statusId = 'complete-correct';
    const route = webhook(db, secret, webhooks);
    const deliver = () => route(webhookRequest(JSON.stringify(payload())));
    const failed = scenario === 'second race loses' || scenario === 'post disappears';
    const response = await deliver();
    assert.equal(response.status, failed ? 503 : 200);
    const expectedWrites = scenario === 'already complete' ? 0 : ['race changes status', 'second race loses'].includes(scenario) ? 2 : 1;
    assert.equal(writes, expectedWrites);
    assert.equal(reads, ['replay', 'already complete'].includes(scenario) ? 1 : 2);
    assert.equal(post.statusId, failed ? 'in-progress' : 'complete-correct');
    const changed = scenario === 'replay' || scenario === 'race changes status';
    assert.deepEqual(webhooks, changed ? [['correct', 'post.status_changed', {
      postId: post.id, oldStatusId: scenario === 'replay' ? 'open' : 'in-progress', newStatusId: 'complete-correct',
    }]] : []);
    assert.equal(metadataUpdates.length, failed ? 0 : 1);
    if (!failed) {
      const update = metadataUpdates[0];
      assert.deepEqual(JSON.parse(JSON.stringify(update.where)), { id: syncRow.id });
      assert.deepEqual(JSON.parse(JSON.stringify(update.data.metadata)), {
        ...priorMetadata, lastLinearAction: 'completed', completedAt: update.data.metadata.completedAt,
      });
      assert.ok(Number.isFinite(Date.parse(update.data.metadata.completedAt)));
    }
    if (scenario === 'replay') {
      assert.equal((await deliver()).status, 200);
      assert.equal(writes, 1);
      assert.equal(webhooks.length, 1);
      assert.equal(metadataUpdates.length, 2);
    }
  });
}
