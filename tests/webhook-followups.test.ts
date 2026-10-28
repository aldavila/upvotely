import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { loadSource } from './load-source';
import { deferred, tick } from './helpers';
import { mapWebhookEvent } from '../src/lib/webhook-events';

const auth = { auth: async () => ({ user: { id: 'user-a' } }) };
const request = (body: unknown) => new Request('https://app.example/settings', { method: 'POST', body: JSON.stringify(body) });
const plain = (value: unknown) => JSON.parse(JSON.stringify(value));

test('organization GET and POST exclude all webhook settings even if the DB returns them', async () => {
  const path = 'src/app/api/organizations/route.ts';
  assert.doesNotMatch(readFileSync(path, 'utf8'), /webhookUrl|webhookEvents|webhookSecret/);
  const org = { id: 'org-a', name: 'Example', slug: 'example', webhookUrl: 'https://secret.example/path', webhookEvents: ['post.created'], webhookSecret: 'secret' };
  const tx = { organization: { create: async () => org }, organizationMember: { create: async () => ({}) }, status: { createMany: async () => ({}) } };
  const db = { organizationMember: { findMany: async () => ['owner', 'admin', 'member'].map(role => ({ organization: org, role })) }, organization: { findUnique: async () => null }, $transaction: async (fn: any) => fn(tx) };
  const routes = loadSource(path, { '@/lib/auth': auth, '@/lib/db': { db } });
  for (const response of [await routes.GET(), await routes.POST(request({ name: 'Example', slug: 'example' }))]) {
    assert.ok(response.ok);
    assert.doesNotMatch(JSON.stringify(await response.json()), /webhookUrl|webhookEvents|webhookSecret|secret/);
  }
});

for (const type of ['slack', 'linear']) {
  test(`${type} GET and POST allowlist the response and Prisma selection`, async () => {
    const config = { webhookUrl: 'https://hooks.slack.com/services/PRIVATE/PATH', channel: '#feedback', notifyOnNewPost: false, apiKey: 'private-api-key', webhookSecret: 'private-secret', teamId: 'team-a' };
    const row = { id: 'integration-a', type, isActive: true, organizationId: 'org-a', createdAt: '2026-01-01', updatedAt: '2026-01-02', config, slackTeamId: null, slackConnectionCodeHash: 'private-hash', githubConnectionCodeHash: 'private-github-hash' };
    const selections: unknown[] = [];
    const query = async ({ select }: any) => { selections.push(plain(select)); return row; };
    const db = { organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) }, integration: { findUnique: query, upsert: query } };
    const routes = loadSource(`src/app/api/integrations/${type}/route.ts`, { '@/lib/auth': auth, '@/lib/db': { db } });
    for (const response of [await routes.GET(), await routes.POST(request(config))]) {
      assert.ok(response.ok);
      const body = await response.json();
      assert.deepEqual(body.integration, type === 'slack' ? {
        isActive: true, slackTeamId: null,
        config: { channel: '#feedback', notifyOnNewPost: false, webhookConfigured: true, webhookUrlMasked: 'https://hooks.slack.com/…' },
      } : { id: 'integration-a', type: 'linear', isActive: true, organizationId: 'org-a', createdAt: '2026-01-01', updatedAt: '2026-01-02', config: { teamId: 'team-a' } });
      assert.doesNotMatch(JSON.stringify(body), /PRIVATE|private-|"webhookUrl"|apiKey|webhookSecret|Hash/);
      if (type === 'slack' && response.status === 201) assert.match(body.connectionCode, /^[a-f0-9]{64}$/);
    }
    const expected = type === 'slack' ? { config: true, isActive: true, slackTeamId: true } : { id: true, type: true, isActive: true, createdAt: true, updatedAt: true, organizationId: true, config: true };
    assert.deepEqual(selections, [expected, expected]);
  });
}

test('Slack settings never prefill a stored URL and clear the input after saving', () => {
  const source = readFileSync('src/app/(dashboard)/dashboard/settings/integrations/slack/page.tsx', 'utf8');
  assert.doesNotMatch(source, /setConfig\(data\.integration\.config/);
  assert.match(source, /webhookConfigured/);
  assert.match(source, /Re-enter/);
  assert.match(source, /setConfig\(.*webhookUrl: ''/);
});

const routeEvents: [string, string[]][] = [
  ['posts', ['post.created']], ['widget/submit', ['post.created']],
  ['posts/[postId]', ['post.updated', 'post.status_changed']],
  ['posts/[postId]/status', ['post.status_changed']],
  ['posts/[postId]/vote', ['vote.created', 'vote.removed']],
  ['comments', ['comment.created']],
  ['integrations/github/webhook', ['post.status_changed']],
  ['integrations/linear/webhook', ['post.status_changed']],
];
for (const [route, events] of routeEvents) {
  test(`${route} schedules the intended webhook events`, () => {
    const source = readFileSync(`src/app/api/${route}/route.ts`, 'utf8');
    assert.match(source, /import \{ emitWebhook \} from '@\/lib\/webhooks\/emit'/);
    for (const event of events) assert.ok(source.includes(`'${event}'`), event);
    assert.match(source, /emitWebhook\(/);
    assert.doesNotMatch(source, /await emitWebhook\(/);
  });
}

test('event mappers allowlist payloads and skip internal comments', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const privateFields = { email: 'private@example.test', author: { email: 'private@example.test' }, content: 'private content', webhookSecret: 'secret', authorId: 'user-a' };
  for (const event of ['post.created', 'post.updated'] as const) {
    assert.deepEqual(plain(mapWebhookEvent(event, { ...privateFields, id: 'post-a', title: 'Feedback', boardId: 'board-a', statusId: 'open', createdAt })),
      { id: 'post-a', title: 'Feedback', boardId: 'board-a', statusId: 'open', createdAt: createdAt.toISOString() });
  }
  assert.deepEqual(plain(mapWebhookEvent('post.status_changed', { ...privateFields, postId: 'post-a', oldStatusId: 'open', newStatusId: 'done' })), { postId: 'post-a', oldStatusId: 'open', newStatusId: 'done' });
  for (const event of ['vote.created', 'vote.removed'] as const) {
    assert.deepEqual(plain(mapWebhookEvent(event, { ...privateFields, postId: 'post-a', voteCount: 3 })), { postId: 'post-a', voteCount: 3 });
  }
  const comment = { ...privateFields, id: 'comment-a', postId: 'post-a', createdAt, isInternal: false };
  assert.deepEqual(plain(mapWebhookEvent('comment.created', comment)), { id: 'comment-a', postId: 'post-a', createdAt: createdAt.toISOString() });
  assert.equal(mapWebhookEvent('comment.created', { ...comment, isInternal: true }), null);
});

test('emitter defers delivery, awaits it in after, and logs no raw errors', async () => {
  assert.ok(existsSync('src/lib/webhooks/emit.ts'), 'emitter exists');
  const callbacks: (() => Promise<void>)[] = [];
  const deliveries: unknown[] = [];
  const logs: unknown[][] = [];
  const gate = deferred();
  const { emitWebhook } = loadSource('src/lib/webhooks/emit.ts', {
    'next/server': { after: (fn: () => Promise<void>) => callbacks.push(fn) },
    '@/lib/webhooks': { triggerWebhook: async (...args: unknown[]) => { deliveries.push(args); await gate.promise; throw new Error('https://secret.example/private'); } },
  }, {}, undefined, (...args) => logs.push(args));
  assert.equal(emitWebhook('org-a', 'vote.created', { postId: 'post-a', voteCount: 3, email: 'private@example.test' }), undefined);
  assert.equal(deliveries.length, 0);
  let finished = false;
  const pending = callbacks[0]().then(() => { finished = true; });
  await tick();
  assert.equal(finished, false);
  gate.resolve(); await pending;
  assert.deepEqual(plain(deliveries), [['org-a', 'vote.created', { postId: 'post-a', voteCount: 3 }]]);
  assert.deepEqual(logs, [['Webhook emission failed']]);
  const count = callbacks.length;
  emitWebhook('org-a', 'comment.created', { id: 'comment-a', postId: 'post-a', createdAt: new Date(), isInternal: true });
  assert.equal(callbacks.length, count);
});

test('triggerWebhook filters subscriptions and awaits the bounded delivery chain', async () => {
  let events: string[] = ['comment.created'];
  let url: string | null = 'https://receiver.example/hook';
  const writes: unknown[] = [];
  const gate = deferred();
  let attempts = 0;
  const { triggerWebhook } = loadSource('src/lib/webhooks/index.ts', {
    '@/lib/db': { db: {
      organization: { findUnique: async () => ({ webhookUrl: url, webhookEvents: events, webhookSecret: null }) },
      webhookEvent: { create: async ({ data }: any) => { writes.push(plain(data)); return { id: 'event-a' }; }, update: async () => ({}) },
    } },
    '../webhook-request': { requestWebhook: async () => { attempts++; await gate.promise; return { ok: false, status: 503 }; } },
  }, { setTimeout: (fn: () => void) => { fn(); } });
  await triggerWebhook('org-a', 'post.created', {});
  assert.equal(writes.length, 0);
  events = [];
  url = null;
  await triggerWebhook('org-a', 'post.created', {});
  assert.equal(writes.length, 0);
  url = 'https://receiver.example/hook';
  let finished = false;
  const pending = triggerWebhook('org-a', 'post.created', {}).then(() => { finished = true; });
  await tick();
  const returnedBeforeDelivery = finished;
  gate.resolve(); await pending; await tick();
  assert.equal(returnedBeforeDelivery, false);
  assert.equal(writes.length, 1);
  assert.equal(attempts, 3);
});

test('emitter contains scheduling errors without logging their details', () => {
  const logs: unknown[][] = [];
  const { emitWebhook } = loadSource('src/lib/webhooks/emit.ts', {
    'next/server': { after: () => { throw new Error('private scheduling details'); } },
    '@/lib/webhooks': { triggerWebhook: async () => assert.fail('Must not deliver') },
  }, {}, undefined, (...args) => logs.push(args));
  assert.doesNotThrow(() => emitWebhook('org-a', 'vote.removed', { postId: 'post-a', voteCount: 0 }));
  assert.deepEqual(logs, [['Webhook emission failed']]);
});

// Exercise the routes with the real emitter and mapper. Only DB, authentication,
// existing notifications/AI, Next's lifecycle, and outbound delivery are replaced.
function eventRoute(route: string, options: { fail?: boolean; apiKey?: boolean; voted?: boolean; internal?: boolean; unchanged?: boolean } = {}) {
  const postId = 'c' + 'p'.repeat(24);
  const boardId = 'c' + 'b'.repeat(24);
  const oldStatusId = 'c' + 'o'.repeat(24);
  const statusId = 'c' + 's'.repeat(24);
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  const board = { id: boardId, organizationId: 'org-a', allowAnonymous: true, isPublic: true, requireApproval: false, name: 'Ideas', slug: 'ideas', organization: { slug: 'example' } };
  const post = { id: postId, title: 'Feedback title', boardId, statusId: options.unchanged ? statusId : oldStatusId, createdAt, board, status: { id: oldStatusId }, author: null, authorId: null, isAnonymous: true, isApproved: true };
  let committed = false;
  let inTransaction = false;
  const callbacks: (() => Promise<void>)[] = [];
  const scheduledAfterWrite: boolean[] = [];
  const delivered: any[] = [];
  const write = async (row: unknown) => {
    if (!inTransaction && options.fail) throw new Error('Write failed');
    if (!inTransaction) committed = true;
    return row;
  };
  const db: any = {
    board: { findUnique: async () => board },
    status: { findFirst: async () => ({ id: statusId, organizationId: 'org-a' }), findUnique: async () => ({ id: statusId, organizationId: 'org-a' }) },
    post: {
      findUnique: async () => post,
      create: async ({ data }: any) => write({ ...post, ...data }),
      update: async () => write({ voteCount: options.voted ? 2 : 4 }),
      updateMany: async () => { committed = !options.fail; return { count: options.fail ? 0 : 1 }; },
    },
    vote: { findUnique: async () => options.voted ? { id: 'vote-a' } : null, create: async () => ({}), delete: async () => ({}) },
    comment: { create: async ({ data }: any) => write({ id: 'comment-a', createdAt, ...data }) },
    organizationMember: { findFirst: async () => ({ organizationId: 'org-a', role: 'owner' }) },
    $transaction: async (fn: any) => {
      inTransaction = true;
      const result = await fn(db);
      inTransaction = false;
      // Fail after the writes to model a rollback at commit time.
      if (options.fail) throw new Error('Transaction rolled back');
      committed = true;
      return result;
    },
  };
  const handlers = loadSource(`src/app/api/${route}/route.ts`, {
    'next/server': { NextResponse: Response, after: (fn: () => Promise<void>) => { callbacks.push(fn); scheduledAfterWrite.push(committed); } },
    '@/lib/auth': auth, '@/lib/db': { db },
    '@/lib/api-auth': { authenticateApiKey: async () => options.apiKey ? { organizationId: 'org-a' } : null },
    '@/lib/webhooks': { triggerWebhook: async (...args: any[]) => delivered.push(plain(args)) },
    '@/lib/notifications/events': { notifyNewPost: async () => {}, notifyStatusChange: async () => {}, notifyMentions: async () => [], notifyNewComment: async () => {} },
    '@/lib/integrations/slack': { notifyPostCreated: async () => {} },
    '@/lib/ai/categorize': { categorizeAndUpdatePost: async () => {} },
    '@/lib/ai/sentiment': { analyzeAndUpdateSentiment: async () => {} },
    '@/lib/ai/similarity': { createMergeSuggestions: async () => {} },
  });
  return {
    delivered, scheduledAfterWrite, postId, oldStatusId, statusId,
    run: () => (handlers.PATCH ?? handlers.POST)(request(route === 'posts/[postId]' || route.endsWith('/status') ? { statusId } : {
      boardId, postId, title: 'Feedback title', content: 'Feedback content', isAnonymous: true, isInternal: options.internal ?? false, userId: 'user-a',
    }), { params: Promise.resolve({ postId }) }),
    finish: async () => { for (const callback of callbacks) await callback(); },
  };
}

for (const route of ['posts', 'widget/submit', 'comments', 'posts/[postId]', 'posts/[postId]/status']) {
  test(`${route} emits minimal events after a successful write and none on failure`, async () => {
    for (const fail of [false, true]) {
      const f = eventRoute(route, { fail });
      const response = await f.run();
      assert.equal(response.ok, !fail);
      assert.equal(f.delivered.length, 0, 'delivery must wait for after');
      assert.ok(f.scheduledAfterWrite.every(Boolean));
      await f.finish();
      const events = route === 'comments' ? ['comment.created'] : route === 'posts/[postId]' ? ['post.updated', 'post.status_changed'] : route.endsWith('/status') ? ['post.status_changed'] : ['post.created'];
      assert.deepEqual(f.delivered.map(args => args[1]), fail ? [] : events);
      for (const [org, event, data] of f.delivered) {
        assert.equal(org, 'org-a');
        if (event === 'post.status_changed') assert.deepEqual(data, { postId: f.postId, oldStatusId: f.oldStatusId, newStatusId: f.statusId });
        else if (event === 'comment.created') assert.deepEqual(Object.keys(data).sort(), ['createdAt', 'id', 'postId']);
        else assert.deepEqual(Object.keys(data).sort(), ['boardId', 'createdAt', 'id', 'statusId', 'title']);
      }
    }
  });
}

for (const apiKey of [false, true]) {
  test(`votes emit only after transaction commit (${apiKey ? 'API key' : 'session'})`, async () => {
    for (const voted of [false, true]) {
      for (const fail of [false, true]) {
        const f = eventRoute('posts/[postId]/vote', { apiKey, voted, fail });
        const response = await f.run();
        assert.equal(response.ok, !fail);
        assert.equal(f.delivered.length, 0);
        assert.ok(f.scheduledAfterWrite.every(Boolean));
        await f.finish();
        assert.deepEqual(f.delivered, fail ? [] : [['org-a', voted ? 'vote.removed' : 'vote.created', { postId: f.postId, voteCount: voted ? 2 : 4 }]]);
        if (!fail) assert.deepEqual(await response.json(), { voted: !voted, voteCount: voted ? 2 : 4 });
      }
    }
  });
}

test('internal comments and unchanged statuses produce no webhook delivery', async () => {
  for (const route of ['comments', 'posts/[postId]', 'posts/[postId]/status']) {
    const f = eventRoute(route, { internal: true, unchanged: true });
    assert.equal((await f.run()).status, route === 'comments' ? 201 : 200);
    await f.finish();
    assert.deepEqual(f.delivered, []);
  }
});
