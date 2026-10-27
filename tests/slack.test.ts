import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { loadSource } from './load-source';

const commandRoute = 'src/app/api/integrations/slack/command/route.ts';
const secret = randomBytes(32).toString('hex');
const env = { SLACK_SIGNING_SECRET: secret, NEXTAUTH_URL: 'https://app.example.test' };
const board = { id: 'caaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ideas', slug: 'ideas', organizationId: 'org-a', organization: { slug: 'example' }, allowAnonymous: true, isPublic: true, requireApproval: false };
const integration = { id: 'integration-a', organizationId: 'org-a', isActive: true, slackTeamId: 'TEXAMPLE', config: { teamId: 'TEXAMPLE' }, organization: { id: 'org-a', slug: 'example', boards: [board], statuses: [{ id: 'status', isDefault: true }] } };
const body = 'team_id=TEXAMPLE&user_name=Tester&command=%2Fupvotely&text=Feedback+title+%7C+Description+text';
function request(raw = body, timestamp = String(Math.floor(Date.now() / 1000)), signed = true) {
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (signed) {
    headers['X-Slack-Request-Timestamp'] = timestamp;
    headers['X-Slack-Signature'] = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex');
  }
  return new Request('https://app.example.test/api/integrations/slack/command', { method: 'POST', headers, body: raw });
}
function setupCommand(matches = [integration], testEnv = env) {
  let reads = 0;
  const posts: any[] = [];
  const notifications: any[] = [];
  const db = {
    integration: {
      findFirst: async () => { reads++; return matches[0] ?? null; },
      findMany: async ({ where }: any) => { reads++; return matches.filter(i => where.slackTeamId ? i.slackTeamId === where.slackTeamId : true); },
    },
    post: { create: async ({ data }: any) => { posts.push(data); return { ...data, id: 'post' }; } },
    integrationSync: { create: async () => ({}) },
  };
  const route = loadSource(commandRoute, { '@/lib/db': { db }, '@/lib/integrations/slack': { notifyPostCreated: async (...args: any[]) => notifications.push(args) } }, testEnv);
  return { route, posts, notifications, reads: () => reads };
}
for (const kind of ['missing', 'bad', 'stale', 'future', 'tampered', 'no-secret']) {
  test(`command rejects ${kind} authentication before DB access`, async () => {
    const f = setupCommand(undefined, kind === 'no-secret' ? {} as typeof env : env);
    let req = request();
    if (kind === 'missing') req = request(body, undefined, false);
    if (kind === 'bad') req.headers.set('X-Slack-Signature', 'v0=invalid');
    if (kind === 'stale' || kind === 'future') req = request(body, String(Math.floor(Date.now() / 1000) + (kind === 'stale' ? -301 : 301)));
    if (kind === 'tampered') req = new Request(req, { body: body + '+changed' });
    const res = await f.route.POST(req);
    assert.equal(res.status, 401);
    assert.equal(f.reads(), 0);
    assert.equal(f.posts.length, 0);
  });
}
test('signed raw form body creates feedback in the verified workspace', async () => {
  const f = setupCommand();
  assert.equal((await f.route.POST(request())).status, 200);
  assert.equal(f.posts.length, 1);
  assert.equal(f.posts[0].boardId, board.id);
});
test('ambiguous workspace mapping never creates feedback', async () => {
  const f = setupCommand([integration, { ...integration, id: 'integration-b', organizationId: 'org-b' }]);
  const res = await f.route.POST(request());
  assert.equal(f.posts.length, 0);
  assert.equal(res.status, 409);
});
test('legacy unverified config.teamId is not a workspace claim', async () => {
  const f = setupCommand([{ ...integration, slackTeamId: null as unknown as string }]);
  await f.route.POST(request());
  assert.equal(f.posts.length, 0);
});
test('Slack-created post invokes notifications', async () => {
  const f = setupCommand();
  await f.route.POST(request());
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0][0], 'org-a');
});
test('description retains every pipe after the first separator', async () => {
  const f = setupCommand();
  await f.route.POST(request(body + '+%7C+more'));
  assert.equal(f.posts[0].content, 'Description text | more');
});

for (const url of ['http://hooks.slack.com/services/test', 'https://localhost/test', 'https://hooks.slack.com.example.test/test', 'https://example.test/test', 'https://hooks.slack.com:444/test', 'https://user@hooks.slack.com/test']) {
  test(`outbound rejects disallowed URL ${url}`, async () => {
    let calls = 0;
    const db = { integration: { findUnique: async () => ({ isActive: true, config: { webhookUrl: url } }) } };
    const slack = loadSource('src/lib/integrations/slack.ts', { '@/lib/db': { db } }, {}, async () => { calls++; return new Response(); });
    assert.equal(await slack.sendSlackNotification('org-a', { text: 'test' }), false);
    assert.equal(calls, 0);
  });
}
test('outbound uses manual redirects and treats redirect as failure', async () => {
  let options: RequestInit | undefined;
  const db = { integration: { findUnique: async () => ({ isActive: true, config: { webhookUrl: 'https://hooks.slack.com/services/test' } }) } };
  const slack = loadSource('src/lib/integrations/slack.ts', { '@/lib/db': { db } }, {}, async (_url, init) => { options = init; return new Response(null, { status: 302, headers: { Location: 'https://localhost/test' } }); });
  assert.equal(await slack.sendSlackNotification('org-a', { text: 'test' }), false);
  assert.equal(options?.redirect, 'manual');
});

for (const path of ['src/app/api/posts/route.ts', 'src/app/api/widget/submit/route.ts']) {
  test(`${path} sends a post-created notification after persistence`, async () => {
    let saved = false;
    const notifications: any[] = [];
    const db: any = {
      board: { findUnique: async () => board },
      status: { findFirst: async () => ({ id: 'status' }) },
      post: { create: async ({ data }: any) => { saved = true; return { ...data, id: 'post', author: null }; } },
    };
    db.$transaction = async (work: any) => work(db);
    const route = loadSource(path, {
      '@/lib/db': { db }, '@/lib/auth': { auth: async () => null },
      '@/lib/api-auth': { authenticateApiKey: async () => null },
      '@/lib/ai/categorize': { categorizeAndUpdatePost: async () => {} },
      '@/lib/ai/sentiment': { analyzeAndUpdateSentiment: async () => {} },
      '@/lib/ai/similarity': { createMergeSuggestions: async () => {} },
      '@/lib/integrations/slack': { notifyPostCreated: async (...args: any[]) => { assert.equal(saved, true); notifications.push(args); } },
    }, env);
    const res = await route.POST(new Request('https://app.example.test/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ boardId: board.id, title: 'Feedback title', content: 'Description text', isAnonymous: true }) }));
    assert.ok(res.ok);
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0][0], 'org-a');
  });
}

const settingsRoute = 'src/app/api/integrations/slack/route.ts';
test('settings issues a connection challenge and never trusts a typed team ID', async () => {
  let write: any;
  const db = {
    organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) },
    integration: { upsert: async (args: any) => { write = args; return { ...args.create, slackTeamId: null }; } },
  };
  const route = loadSource(settingsRoute, { '@/lib/db': { db }, '@/lib/auth': { auth: async () => ({ user: { id: 'admin-a' } }) } }, env);
  const res = await route.POST(new Request('https://app.example.test/api/integrations/slack', { method: 'POST', body: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/test', teamId: 'TOTHER', organizationId: 'org-b' }) }));
  const data = await res.json();
  assert.equal(res.status, 201);
  assert.equal(typeof data.connectionCode, 'string');
  assert.equal(write.create.organizationId, 'org-a');
  assert.equal(write.create.config.teamId, undefined);
  assert.equal(write.create.slackTeamId, undefined);
  assert.equal(typeof write.create.slackConnectionCodeHash, 'string');
  assert.notEqual(write.create.slackConnectionCodeHash, data.connectionCode);
});
test('settings rejects unsafe webhook URLs before saving', async () => {
  let writes = 0;
  const db = {
    organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) },
    integration: { upsert: async () => { writes++; return {}; } },
  };
  const route = loadSource(settingsRoute, { '@/lib/db': { db }, '@/lib/auth': { auth: async () => ({ user: { id: 'admin-a' } }) } }, env);
  const res = await route.POST(new Request('https://app.example.test/api/integrations/slack', { method: 'POST', body: JSON.stringify({ webhookUrl: 'https://example.test/webhook' }) }));
  assert.equal(res.status, 400);
  assert.equal(writes, 0);
});
for (const role of ['member', 'unrelated-admin']) {
  test(`settings rejects ${role} without an admin membership for the target organization`, async () => {
    let writes = 0;
    const db = {
      organizationMember: { findFirst: async ({ where }: any) => where.userId === 'caller' && where.role.in.includes('admin') ? null : { organizationId: 'org-b' } },
      integration: { upsert: async () => { writes++; return {}; } },
    };
    const route = loadSource(settingsRoute, { '@/lib/db': { db }, '@/lib/auth': { auth: async () => ({ user: { id: 'caller' } }) } }, env);
    const res = await route.POST(new Request('https://app.example.test/api/integrations/slack', { method: 'POST', body: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/test', organizationId: 'org-b' }) }));
    assert.equal(res.status, 403);
    assert.equal(writes, 0);
  });
}

test('only an admin-issued, unexpired code binds a signed workspace and it is single-use', async () => {
  let stored: any;
  const db = {
    organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) },
    integration: {
      upsert: async ({ create, select }: any) => {
        stored = { ...create, slackTeamId: null };
        return Object.fromEntries(Object.keys(select).map(key => [key, stored[key]]));
      },
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.type, 'slack');
        assert.equal(where.isActive, true);
        assert.equal(where.slackTeamId, null);
        if (stored.slackTeamId !== null || stored.slackConnectionCodeHash !== where.slackConnectionCodeHash || stored.slackConnectionExpiresAt <= where.slackConnectionExpiresAt.gt) return { count: 0 };
        Object.assign(stored, data);
        return { count: 1 };
      },
    },
  };
  const stubs = { '@/lib/db': { db }, '@/lib/auth': { auth: async () => ({ user: { id: 'admin-a' } }) } };
  const settings = loadSource(settingsRoute, stubs, env);
  const command = loadSource(commandRoute, stubs, env);
  const saved = await settings.POST(new Request('https://app.example.test/api/integrations/slack', { method: 'POST', body: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/test' }) }));
  const data = await saved.json();
  assert.equal(data.integration.slackConnectionCodeHash, undefined);
  const connectBody = body.replace(/&text=.*/, '&text=connect+' + data.connectionCode);
  const wrongBody = body.replace(/&text=.*/, '&text=connect+' + randomBytes(32).toString('hex'));
  assert.equal((await command.POST(request(wrongBody))).status, 400);
  assert.equal(stored.slackTeamId, null);
  const expiry = stored.slackConnectionExpiresAt;
  stored.slackConnectionExpiresAt = new Date(0);
  assert.equal((await command.POST(request(connectBody))).status, 400);
  assert.equal(stored.slackTeamId, null);
  stored.slackConnectionExpiresAt = expiry;
  assert.equal((await command.POST(request(connectBody))).status, 200);
  assert.equal(stored.slackTeamId, 'TEXAMPLE');
  assert.equal(stored.organizationId, 'org-a');
  assert.equal(stored.slackConnectionCodeHash, null);
  assert.equal(stored.slackConnectionExpiresAt, null);
  assert.equal((await command.POST(request(connectBody))).status, 400);
});
test('database uniqueness conflicts reject a workspace claim', async () => {
  const db = { integration: { updateMany: async () => { throw { code: 'P2002' }; } } };
  const route = loadSource(commandRoute, { '@/lib/db': { db } }, env);
  const raw = body.replace(/&text=.*/, '&text=connect+' + randomBytes(32).toString('hex'));
  assert.equal((await route.POST(request(raw))).status, 409);
});
test('unsigned connection requests cannot bind a workspace', async () => {
  let writes = 0;
  const db = { integration: { updateMany: async () => { writes++; return { count: 1 }; } } };
  const route = loadSource(commandRoute, { '@/lib/db': { db } }, env);
  const raw = body.replace(/&text=.*/, '&text=connect+' + randomBytes(32).toString('hex'));
  assert.equal((await route.POST(request(raw, undefined, false))).status, 401);
  assert.equal(writes, 0);
});
for (const config of [null, [], {}, { webhookUrl: 'https://hooks.slack.com/services/test', notifyOnNewPost: false }]) {
  test('post notification skips disabled or invalid configuration', async () => {
    let calls = 0;
    const db = { integration: { findUnique: async () => ({ isActive: true, config }) } };
    const slack = loadSource('src/lib/integrations/slack.ts', { '@/lib/db': { db } }, env, async () => { calls++; return new Response(); });
    assert.equal(await slack.notifyPostCreated('org-a', { title: 'Feedback', content: 'Details', boardName: 'Ideas', authorName: null, organizationSlug: 'example', boardSlug: 'ideas' }), false);
    assert.equal(calls, 0);
  });
}
test('post notification sends the message using only the post organization integration', async () => {
  let lookup: any;
  let payload: any;
  const db = { integration: { findUnique: async (args: any) => { lookup = args; return { isActive: true, config: { webhookUrl: 'https://hooks.slack.com/services/test', channel: '#ideas' } }; } } };
  const slack = loadSource('src/lib/integrations/slack.ts', { '@/lib/db': { db } }, env, async (_url, options) => { payload = JSON.parse(options?.body as string); return new Response(); });
  assert.equal(await slack.notifyPostCreated('org-a', { title: 'Feedback', content: 'Details', boardName: 'Ideas', authorName: null, organizationSlug: 'example', boardSlug: 'ideas' }), true);
  assert.equal(lookup.where.organizationId_type.organizationId, 'org-a');
  assert.equal(payload.text, 'New feedback: Feedback');
  assert.equal(payload.channel, '#ideas');
});
for (const failure of ['database', 'network', 'http', 'inactive']) {
  test(`notification ${failure} failure returns false`, async () => {
    let calls = 0;
    const db = { integration: { findUnique: async () => {
      if (failure === 'database') throw new Error('Fake database failure');
      return { isActive: failure !== 'inactive', config: { webhookUrl: 'https://hooks.slack.com/services/test' } };
    } } };
    const slack = loadSource('src/lib/integrations/slack.ts', { '@/lib/db': { db } }, env, async () => {
      calls++;
      if (failure === 'network') throw new Error('Fake network failure');
      return new Response(null, { status: 500 });
    });
    assert.equal(await slack.sendSlackNotification('org-a', { text: 'Feedback' }), false);
    assert.equal(calls, failure === 'inactive' || failure === 'database' ? 0 : 1);
  });
}
