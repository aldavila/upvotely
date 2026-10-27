import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSource } from './load-source';

test('db-push deployment reaches next build without deploying incremental migrations', () => {
  mkdirSync('/tmp/upvotely-r2', { recursive: true });
  const dir = mkdtempSync('/tmp/upvotely-r2/deploy-');
  const output = openSync(join(dir, 'output'), 'w');
  try {
    // Run the real build script with offline process doubles. This project has
    // no migration baseline: builds must not run migrate deploy on fresh or
    // db-push-managed databases. Never start Prisma or access a database.
    writeFileSync(join(dir, 'prisma'), `#!${process.execPath}
const fs = require('node:fs');
const assert = require('node:assert/strict');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(${JSON.stringify(join(dir, 'calls'))}, args + '\\n');
assert.equal(args, 'generate');
`, { mode: 0o755 });
    writeFileSync(join(dir, 'next'), `#!${process.execPath}
require('node:assert/strict').deepEqual(process.argv.slice(2), ['build']);
require('node:fs').appendFileSync(${JSON.stringify(join(dir, 'calls'))}, 'next build\\n');
`, { mode: 0o755 });
    const build = JSON.parse(readFileSync('package.json', 'utf8')).scripts.build;
    execFileSync('/bin/sh', ['-c', build], { env: { PATH: dir, NODE_ENV: 'test' }, stdio: ['ignore', output, output] });
    assert.equal(readFileSync(join(dir, 'calls'), 'utf8'), 'generate\nnext build\n');
    execFileSync('git', ['check-ignore', '--quiet', '--no-index', 'prisma/migrations/future/migration.sql'], { stdio: ['ignore', output, output] });
  } catch (error) {
    throw new Error(readFileSync(join(dir, 'output'), 'utf8'), { cause: error });
  } finally {
    closeSync(output);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settings renders only the supported new-post notification toggle', async () => {
  let stateIndex = 0;
  let saved: any;
  const element = (type: any, props: any) => ({ type, props });
  const stubs: Record<string, unknown> = {
    react: { useState: (initial: any) => [stateIndex++ === 2 ? false : initial, () => {}], useEffect: () => {} },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'lucide-react': { MessageSquare: 'MessageSquare', Loader2: 'Loader2' },
  };
  for (const [file, names] of Object.entries({ card: ['Card', 'CardContent', 'CardDescription', 'CardHeader', 'CardTitle'], input: ['Input'], label: ['Label'], button: ['Button'], switch: ['Switch'], badge: ['Badge'] })) {
    stubs[`@/components/ui/${file}`] = Object.fromEntries(names.map(name => [name, name]));
  }
  const page = loadSource('src/app/(dashboard)/dashboard/settings/integrations/slack/page.tsx', stubs, {}, async (_url, init) => {
    saved = JSON.parse(init?.body as string);
    return Response.json({ integration: { slackTeamId: null } });
  });
  const nodes: any[] = [];
  function visit(node: any) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node && typeof node === 'object') { nodes.push(node); visit(node.props?.children); }
  }
  visit(page.default());
  const switches = nodes.filter(node => node.type === 'Switch');
  assert.equal(switches.length, 1, 'Do not offer status or vote notifications that have no callers');
  assert.equal(switches[0].props.checked, true);
  await nodes.find(node => node.type === 'Button').props.onClick();
  assert.deepEqual(Object.keys(saved).sort(), ['channel', 'notifyOnNewPost', 'webhookUrl']);
});

const commandPath = 'src/app/api/integrations/slack/command/route.ts';
const settingsPath = 'src/app/api/integrations/slack/route.ts';
const postPaths = ['src/app/api/posts/route.ts', 'src/app/api/widget/submit/route.ts', commandPath];
const secret = randomBytes(32).toString('hex');
const board = { id: 'caaaaaaaaaaaaaaaaaaaaaaaa', name: 'Ideas', slug: 'ideas', organizationId: 'org-a', organization: { slug: 'example' }, allowAnonymous: true, isPublic: true, requireApproval: false };
function request(path: string) {
  const body = path === commandPath ? 'team_id=TEXAMPLE&user_name=Tester&command=%2Fupvotely&text=Feedback+title+%7C+Description+text' : JSON.stringify({ boardId: board.id, title: 'Feedback title', content: 'Description text', isAnonymous: true });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return new Request('https://app.example.test/test', { method: 'POST', body, headers: {
    'Content-Type': path === commandPath ? 'application/x-www-form-urlencoded' : 'application/json',
    'X-Slack-Request-Timestamp': timestamp,
    'X-Slack-Signature': 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex'),
  } });
}
function postRoute(path: string, requireApproval: boolean, notifyPostCreated: (...args: any[]) => Promise<any>) {
  const posts: any[] = [];
  const testBoard = { ...board, requireApproval };
  const db: any = {
    board: { findUnique: async () => testBoard },
    status: { findFirst: async () => ({ id: 'status' }) },
    post: { create: async ({ data }: any) => { posts.push(data); return { isApproved: true, ...data, id: 'post', author: null }; } },
    integration: { findMany: async () => [{ id: 'integration', organizationId: 'org-a', organization: { slug: 'example', boards: [testBoard], statuses: [{ id: 'status', isDefault: true }] } }] },
    integrationSync: { create: async () => ({}) },
  };
  db.$transaction = async (work: any) => work(db);
  return { posts, route: loadSource(path, {
    '@/lib/db': { db }, '@/lib/auth': { auth: async () => null },
    '@/lib/api-auth': { authenticateApiKey: async () => null },
    '@/lib/ai/categorize': { categorizeAndUpdatePost: async () => {} },
    '@/lib/ai/sentiment': { analyzeAndUpdateSentiment: async () => {} },
    '@/lib/ai/similarity': { createMergeSuggestions: async () => {} },
    '@/lib/integrations/slack': { notifyPostCreated },
  }, { SLACK_SIGNING_SECRET: secret }) };
}
for (const path of postPaths) {
  test(`${path} responds while Slack is still pending`, async () => {
    let finish!: () => void;
    const delivery = new Promise<void>(resolve => { finish = resolve; });
    let notified = false;
    const { route, posts } = postRoute(path, false, async () => { notified = true; await delivery; });
    let response: Response | undefined;
    const pending = route.POST(request(path)).then((res: Response) => { response = res; });
    try {
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(posts.length, 1);
      assert.equal(notified, true);
      assert.ok(response?.ok, 'Response must not wait for Slack delivery');
    } finally { finish(); await pending; }
  });
  test(`${path} does not notify Slack about feedback awaiting approval`, async () => {
    let notifications = 0;
    const { route, posts } = postRoute(path, true, async () => { notifications++; });
    const response = await route.POST(request(path));
    assert.ok(response.ok);
    assert.equal(posts[0].isApproved, false);
    assert.equal(notifications, 0);
    if (path === commandPath) {
      const data = await response.json();
      assert.equal(data.response_type, 'ephemeral');
      assert.equal(data.text, 'Feedback submitted for approval.');
    }
  });
  test(`${path} survives rejected notification delivery`, async () => {
    const { route } = postRoute(path, false, async () => { throw new Error('Synthetic delivery failure'); });
    const response = await route.POST(request(path));
    assert.ok(response.ok);
    const data = await response.json();
    if (path === commandPath) assert.match(data.text, /Feedback created/);
    else if (path.includes('widget')) assert.equal(data.success, true);
    else assert.equal(data.id, 'post');
    await new Promise(resolve => setImmediate(resolve));
  });
}

test('notification escapes user-supplied Slack mentions and links', () => {
  const slack = loadSource('src/lib/integrations/slack.ts', { '@/lib/db': {} });
  const input = '<!channel> <https://example.test|link> &';
  const escaped = '&lt;!channel&gt; &lt;https://example.test|link&gt; &amp;';
  const message = slack.buildPostCreatedMessage({ title: input, content: input, boardName: input, authorName: input, url: 'https://app.example.test/example/ideas' });
  assert.equal(message.text, `New feedback: ${escaped}`);
  assert.equal(message.blocks[1].text.text, `*${escaped}*\n${escaped}`);
  assert.equal(message.blocks[2].elements[0].text, `By ${escaped} | <https://app.example.test/example/ideas|View Post>`);
});

test('workspace clash returns a Slack-readable ephemeral error', async () => {
  const route = loadSource(commandPath, { '@/lib/db': { db: { integration: { findMany: async () => { throw { code: 'P2002' }; } } } } }, { SLACK_SIGNING_SECRET: secret });
  const res = await route.POST(request(commandPath));
  assert.equal(res.status, 409);
  const data = await res.json();
  assert.equal(data.response_type, 'ephemeral');
  assert.equal(data.text, 'Workspace is already connected');
});

for (const path of [commandPath, settingsPath]) {
  test(`${path} logs unexpected failures without exception data`, async () => {
    const logs: unknown[][] = [];
    const sensitive = randomBytes(32).toString('hex');
    const fail = async () => { throw new Error(sensitive); };
    const route = loadSource(path, { '@/lib/db': { db: { integration: { findMany: fail } } }, '@/lib/auth': { auth: fail } }, { SLACK_SIGNING_SECRET: secret }, undefined, (...args) => logs.push(args));
    const response = await route.POST(request(path));
    assert.ok(response);
    assert.equal(logs.length, 1);
    assert.match(String(logs[0][0]), /Slack/i);
    assert.equal(logs[0].length, 1, 'Only log a fixed, sanitized message');
    assert.equal(JSON.stringify(logs).includes(sensitive), false);
  });
}

test('settings saves only supported notification preferences', async () => {
  let saved: any;
  const route = loadSource(settingsPath, {
    '@/lib/auth': { auth: async () => ({ user: { id: 'admin' } }) },
    '@/lib/db': { db: {
      organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) },
      integration: { upsert: async ({ create }: any) => { saved = create.config; return create; } },
    } },
  });
  const response = await route.POST(new Request('https://app.example.test/settings', { method: 'POST', body: JSON.stringify({ webhookUrl: 'https://hooks.slack.com/services/test', notifyOnNewPost: false, notifyOnStatusChange: true, notifyOnVoteMilestone: true, voteMilestones: [10] }) }));
  assert.equal(response.status, 201);
  assert.deepEqual(Object.keys(saved).sort(), ['notifyOnNewPost', 'webhookUrl']);
  assert.equal(saved.notifyOnNewPost, false);
});
