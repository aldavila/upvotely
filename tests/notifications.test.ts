import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { loader } from './load';

const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
for (const file of ['src/lib/notifications/index.ts', 'src/app/(dashboard)/dashboard/settings/notifications/page.tsx']) {
  test(`${file} passes the TypeScript build gate`, () => {
    const errors = diagnostics.filter(diagnostic => diagnostic.file?.fileName.endsWith(file));
    assert.equal(errors.length, 0, errors.map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'));
  });
}

async function email(title: string, message: string, link?: string, status = 200, provider = 'resend') {
  const requests: { url: string; options: RequestInit; body: any }[] = [];
  const load = loader({ '@/lib/db': { db: { user: { findUnique: async () => ({ email: 'recipient@example.test' }) } } } }, {
    process: { env: { EMAIL_PROVIDER: provider, RESEND_API_KEY: 'test-placeholder', SENDGRID_API_KEY: 'test-placeholder' } },
    fetch: async (url: string, options: RequestInit) => {
      requests.push({ url, options, body: JSON.parse(options.body as string) });
      return new Response(null, { status });
    },
  });
  await load('src/lib/notifications/email.ts').sendEmailNotification({ userId: 'recipient', title, message, link });
  return requests;
}

test('email escapes titles, messages, and link attributes', async () => {
  const [{ body }] = await email('<img src=x>', 'A & B "quoted" \'text\'', '/board?q=" onclick="bad');
  assert.ok(body.html.includes('&lt;img src=x&gt;'));
  assert.ok(body.html.includes('A &amp; B &quot;quoted&quot; &#39;text&#39;'));
  assert.ok(!body.html.includes('href="/board?q=" onclick='));
});

for (const link of ['javascript:alert(1)', 'data:text/html,bad', '//example.test/path', '/\\example.test', 'java\nscript:alert(1)']) {
  test(`email omits unsafe link ${JSON.stringify(link)}`, async () => {
    const [{ body }] = await email('Title', 'Message', link);
    assert.ok(!body.html.includes('<a '));
  });
}
for (const link of ['https://example.test/board', 'http://example.test/board', '/board']) {
  test(`email keeps safe navigation link ${link}`, async () => {
    const [{ body }] = await email('Title', 'Message', link);
    assert.ok(body.html.includes(`href="${link}"`));
  });
}
for (const provider of ['resend', 'sendgrid']) {
  test(`${provider} rejects HTTP failures`, async () => {
    await assert.rejects(email('Title', 'Message', undefined, 500, provider));
  });
  test(`${provider} does not follow redirects`, async () => {
    const [request] = await email('Title', 'Message', undefined, 200, provider);
    assert.equal(request.options.redirect, 'manual');
    await assert.rejects(email('Title', 'Message', undefined, 302, provider));
  });
}

for (const digest of ['daily', 'weekly', 'instant', 'none']) {
  test(`email delivery respects ${digest} preference without dropping legacy digests`, async () => {
    const writes: any[] = [];
    const sends: any[] = [];
    const load = loader({
      '@/lib/db': { db: {
        notificationPreference: { findUnique: async () => ({ emailDigest: digest }) },
        notification: { create: async ({ data }: any) => writes.push(data) },
      } },
      './email': { sendEmailNotification: async (data: any) => { sends.push(data); } },
    });
    const params = { userId: 'recipient', organizationId: 'org', type: 'new_post', title: 'Title', message: 'Message', metadata: { nested: [1, true, null, { text: 'value' }] } };
    const result = await load('src/lib/notifications/index.ts').createNotification(params);
    assert.deepEqual(writes, [params]);
    assert.equal(sends.length, digest === 'none' ? 0 : 1);
    assert.equal(result.email, digest !== 'none');
  });
}

const responseStub = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
for (const digest of ['daily', 'weekly', 'instant', 'none']) {
  test(`preferences API validates ${digest}`, async () => {
    let writes = 0;
    const load = loader({
      'next/server': responseStub,
      '@/lib/auth': { auth: async () => ({ user: { id: 'actor' } }) },
      '@/lib/db': { db: {
        organizationMember: { findFirst: async () => ({ organizationId: 'org' }) },
        notificationPreference: { upsert: async () => { writes++; return {}; } },
      } },
    });
    const response = await load('src/app/api/notifications/preferences/route.ts').PUT(new Request('https://app.example.test/preferences', { method: 'PUT', body: JSON.stringify({ emailDigest: digest }) }));
    const supported = digest === 'instant' || digest === 'none';
    assert.equal(response.status, supported ? 200 : 400);
    assert.equal(writes, supported ? 1 : 0);
  });
}

function events(options: { internal?: boolean; member?: boolean; authorId?: string | null; failSave?: boolean } = {}) {
  const notifications: any[] = [];
  const board = { id: 'cboard00000000000000000000', organizationId: 'org', slug: 'board', organization: { slug: 'organization' }, isPublic: true, allowAnonymous: true, requireApproval: false };
  const post = { id: 'cpost000000000000000000000', boardId: board.id, board, title: 'Example post', authorId: options.authorId === undefined ? 'recipient' : options.authorId, isApproved: true };
  const db = {
    board: { findUnique: async () => board },
    status: { findFirst: async () => ({ id: 'status' }) },
    post: { findUnique: async () => post, create: async () => { if (options.failSave) throw new Error('Save failed'); return post; }, update: async () => post },
    vote: { create: async () => ({}) },
    comment: { create: async ({ data }: any) => { if (options.failSave) throw new Error('Save failed'); return { id: 'comment', ...data }; } },
    organizationMember: {
      findMany: async ({ where }: any) => { assert.equal(where.organizationId, 'org'); return [{ userId: 'actor' }, { userId: 'recipient' }]; },
      findFirst: async ({ where }: any) => { assert.equal(where.organizationId, 'org'); return where.userId === 'actor' || options.member ? { userId: where.userId } : null; },
    },
    notificationPreference: { findUnique: async () => ({ emailDigest: 'none' }) },
    notification: { create: async ({ data }: any) => { notifications.push(data); return data; } },
    $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
  };
  const load = loader({
    'next/server': responseStub,
    '@/lib/db': { db },
    '@/lib/auth': { auth: async () => ({ user: { id: 'actor' } }) },
    '@/lib/api-auth': { authenticateApiKey: async () => null },
    '@/lib/ai/categorize': { categorizeAndUpdatePost: async () => {} },
    '@/lib/ai/sentiment': { analyzeAndUpdateSentiment: async () => {} },
    '@/lib/ai/similarity': { createMergeSuggestions: async () => {} },
  });
  return {
    notifications,
    submit: async (route: string) => load(`src/app/api/${route}/route.ts`).POST(new Request('https://app.example.test/event', {
      method: 'POST', body: JSON.stringify({ boardId: board.id, postId: post.id, title: post.title, content: 'Example feedback content', isInternal: options.internal ?? false }),
    })),
  };
}
for (const route of ['posts', 'widget/submit', 'comments']) {
  test(`${route} generates notifications after saving`, async () => {
    const fixture = events();
    const response = await fixture.submit(route);
    assert.ok(response.ok);
    assert.equal(fixture.notifications.length, route === 'widget/submit' ? 2 : 1);
    assert.ok(fixture.notifications.every(n => n.organizationId === 'org' && n.type === (route === 'comments' ? 'new_comment' : 'new_post')));
  });
  test(`${route} does not notify when saving fails`, async () => {
    const fixture = events({ failSave: true });
    assert.equal((await fixture.submit(route)).status, 500);
    assert.equal(fixture.notifications.length, 0);
  });
}
for (const authorId of ['actor', null]) {
  test(`comments skip self or anonymous author: ${authorId}`, async () => {
    const fixture = events({ authorId });
    assert.ok((await fixture.submit('comments')).ok);
    assert.equal(fixture.notifications.length, 0);
  });
}
for (const member of [false, true]) {
  test(`internal comment author membership: ${member}`, async () => {
    const fixture = events({ internal: true, member });
    assert.ok((await fixture.submit('comments')).ok);
    assert.equal(fixture.notifications.length, member ? 1 : 0);
  });
}
