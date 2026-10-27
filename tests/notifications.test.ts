import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from 'typescript';
import { loader } from './load';

const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(parsed.fileNames, { ...parsed.options, incremental: false });
const diagnostics = ts.getPreEmitDiagnostics(program);
for (const file of ['src/lib/notifications/index.ts', 'src/lib/notifications/events.ts', 'src/app/api/comments/route.ts', 'src/app/api/posts/[postId]/route.ts', 'src/app/(dashboard)/dashboard/settings/notifications/page.tsx']) {
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

function events(options: {
  internal?: boolean; member?: boolean; authorId?: string | null; failSave?: boolean;
  content?: string; members?: { userId: string; user: { name: string | null; email: string } }[];
  anonymous?: boolean; failMentions?: boolean; failCommentNotification?: boolean;
} = {}) {
  const notifications: any[] = [];
  const emails: any[] = [];
  const board = { id: 'cboard00000000000000000000', organizationId: 'org', slug: 'board', organization: { slug: 'organization' }, isPublic: true, allowAnonymous: true, requireApproval: false };
  const post = { id: 'cpost000000000000000000000', boardId: board.id, board, title: 'Example post', authorId: options.authorId === undefined ? 'recipient' : options.authorId, isApproved: true };
  const db = {
    board: { findUnique: async () => board },
    status: { findFirst: async () => ({ id: 'status' }) },
    post: { findUnique: async () => post, create: async ({ data }: any) => { if (options.failSave) throw new Error('Save failed'); return { ...post, ...data }; }, update: async () => post },
    vote: { create: async () => ({}) },
    comment: { create: async ({ data }: any) => { if (options.failSave) throw new Error('Save failed'); return { id: 'comment', ...data }; } },
    organizationMember: {
      findMany: async ({ where }: any) => { assert.equal(where.organizationId, 'org'); if (options.failMentions) throw new Error('Mention lookup failed'); return options.members ?? [{ userId: 'actor' }, { userId: 'recipient' }]; },
      findFirst: async ({ where }: any) => { assert.equal(where.organizationId, 'org'); return where.userId === 'actor' || options.member ? { userId: where.userId } : null; },
    },
    notificationPreference: { findUnique: async () => ({ emailDigest: 'instant' }) },
    notification: { create: async ({ data }: any) => { if (options.failCommentNotification && data.type === 'new_comment') throw new Error('Author notification failed'); notifications.push(data); return data; } },
    $transaction: async (fn: (tx: unknown) => unknown): Promise<unknown> => fn(db),
  };
  const load = loader({
    'next/server': responseStub,
    '@/lib/db': { db },
    '@/lib/auth': { auth: async () => ({ user: { id: 'actor' } }) },
    '@/lib/api-auth': { authenticateApiKey: async () => null },
    './email': { sendEmailNotification: async (data: any) => { emails.push(data); } },
    '@/lib/ai/categorize': { categorizeAndUpdatePost: async () => {} },
    '@/lib/ai/sentiment': { analyzeAndUpdateSentiment: async () => {} },
    '@/lib/ai/similarity': { createMergeSuggestions: async () => {} },
  });
  return {
    notifications, emails,
    submit: async (route: string) => load(`src/app/api/${route}/route.ts`).POST(new Request('https://app.example.test/event', {
      method: 'POST', body: JSON.stringify({ boardId: board.id, postId: post.id, title: post.title, content: options.content ?? 'Example feedback content', isInternal: options.internal ?? false, isAnonymous: options.anonymous ?? false }),
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

test('mention lookup failure still delivers the post author notification', async () => {
  const fixture = events({ failMentions: true, content: '@Teammate hello' });
  assert.equal((await fixture.submit('comments')).status, 201);
  assert.deepEqual(fixture.notifications.map(n => [n.userId, n.type]), [['recipient', 'new_comment']]);
});
test('post author notification failure does not fail the saved comment', async () => {
  const fixture = events({ failCommentNotification: true });
  assert.equal((await fixture.submit('comments')).status, 201);
});

for (const route of ['widget/submit', 'posts']) {
  test(`${route}: anonymous submissions create in-app notifications without instant email`, async () => {
    const fixture = events({ anonymous: true });
    assert.ok((await fixture.submit(route)).ok);
    assert.ok(fixture.notifications.length > 0);
    assert.equal(fixture.emails.length, 0);
  });
}
test('account submissions still send instant new-post email', async () => {
  const fixture = events();
  assert.ok((await fixture.submit('posts')).ok);
  assert.equal(fixture.emails.length, 1);
});

const mentionMembers = [
  { userId: 'actor', user: { name: 'Actor', email: 'actor@example.test' } },
  { userId: 'recipient', user: { name: 'Post Author', email: 'author@example.test' } },
  { userId: 'other', user: { name: 'Teammate', email: 'other.member@example.test' } },
];
for (const internal of [false, true]) {
  test(`mentions resolve only org members, dedupe aliases and exclude self (internal=${internal})`, async () => {
    const fixture = events({
      internal, member: true, members: mentionMembers,
      content: '@AUTHOR @author @actor @Teammate @other.member @outsider',
    });
    assert.ok((await fixture.submit('comments')).ok);
    assert.deepEqual(fixture.notifications.map(n => [n.userId, n.type]), [
      ['recipient', 'mention'], ['other', 'mention'],
    ]);
    assert.equal(fixture.emails.length, 2);
  });
}
test('internal comments never notify an outside post author, even when mentioned', async () => {
  const fixture = events({
    internal: true, members: [mentionMembers[0], mentionMembers[2]],
    content: '@author @Teammate',
  });
  assert.ok((await fixture.submit('comments')).ok);
  assert.deepEqual(fixture.notifications.map(n => [n.userId, n.type]), [['other', 'mention']]);
  assert.equal(fixture.emails.length, 1);
});
test('mentions cap recipients at 10 and leave unmentioned post-author notifications intact', async () => {
  const members = Array.from({ length: 15 }, (_, index) => ({
    userId: `member-${index}`, user: { name: `Member${index}`, email: `member${index}@example.test` },
  }));
  const fixture = events({ members, content: members.map(member => `@${member.user.name}`).join(' ') });
  assert.ok((await fixture.submit('comments')).ok);
  assert.equal(fixture.notifications.filter(n => n.type === 'mention').length, 10);
  assert.equal(new Set(fixture.notifications.map(n => n.userId)).size, 11);
  assert.equal(fixture.notifications.filter(n => n.type === 'new_comment').length, 1);
});

function statusEvents(options: {
  unchanged?: boolean; authorized?: boolean; member?: boolean; foreignStatus?: boolean;
  failSave?: boolean; failNotify?: boolean; conflict?: boolean; recipientMembers?: string[];
} = {}) {
  const notifications: any[] = [];
  const emails: any[] = [];
  const afterTasks: (() => Promise<unknown>)[] = [];
  const postId = 'cpost000000000000000000000';
  const oldStatus = { id: 'cstatus0000000000000000000', name: 'Open' };
  const newStatus = options.unchanged ? oldStatus : { id: 'cstatus0000000000000000001', name: 'Planned' };
  let writes = 0;
  const db = {
    post: {
      findUnique: async () => ({ id: postId, title: 'Feedback', authorId: 'author', statusId: oldStatus.id, status: oldStatus, board: { organizationId: 'org' } }),
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.statusId, oldStatus.id);
        assert.equal(data.statusId, newStatus.id);
        if (options.failSave) throw new Error('Save failed');
        writes++;
        return { count: options.conflict ? 0 : 1 };
      },
    },
    status: { findFirst: async ({ where }: any) => {
      assert.equal(where.organizationId, 'org');
      return options.foreignStatus ? null : newStatus;
    } },
    organizationMember: { findMany: async ({ where }: any) => {
      assert.equal(where.organizationId, 'org');
      return (options.recipientMembers ?? ['author', 'voter']).map(userId => ({ userId }));
    }, findFirst: async ({ where }: any) => {
      assert.equal(where.organizationId, 'org');
      assert.equal(where.userId, 'actor');
      assert.deepEqual(Array.from(where.role.in), ['owner', 'admin']);
      return options.member === false ? null : { role: 'admin' };
    } },
    vote: { findMany: async ({ where }: any) => {
      assert.equal(where.postId, postId);
      // The real Vote.userId FK only permits account holders.
      return [{ userId: 'author' }, { userId: 'voter' }, { userId: 'actor' }, { userId: 'voter' }];
    } },
    notificationPreference: { findUnique: async () => null },
    notification: { create: async ({ data }: any) => {
      if (options.failNotify) throw new Error('Notification failed');
      notifications.push(data);
    } },
  };
  const load = loader({
    'next/server': { ...responseStub, after: (task: () => Promise<unknown>) => { afterTasks.push(task); } },
    '@/lib/auth': { auth: async () => options.authorized === false ? null : { user: { id: 'actor' } } },
    '@/lib/db': { db },
    './email': { sendEmailNotification: async (data: any) => { emails.push(data); } },
  });
  const handlePatch = (body = JSON.stringify({ statusId: newStatus.id })) =>
    load('src/app/api/posts/[postId]/route.ts').PATCH(new Request('https://app.example.test/post', {
      method: 'PATCH', body,
    }), { params: Promise.resolve({ postId }) });
  // Model the request lifecycle: close the response, then await registered after work.
  const finishRequest = async () => {
    for (const task of afterTasks) await task();
  };
  return {
    notifications, emails, afterTasks, handlePatch, finishRequest, writes: () => writes,
    patch: async () => {
      const response = await handlePatch();
      await finishRequest();
      return response;
    },
    load, oldStatus,
  };
}
test('status change notifies author and real-account voters once, excluding actor', async () => {
  const fixture = statusEvents();
  assert.equal((await fixture.patch()).status, 200);
  assert.equal(fixture.writes(), 1);
  assert.deepEqual(fixture.notifications.map(n => [n.userId, n.type]), [['author', 'status_change'], ['voter', 'status_change']]);
  assert.ok(fixture.notifications.every(n => n.organizationId === 'org' && n.message === 'Open → Planned'));
});
test('unchanged status neither writes nor notifies', async () => {
  const fixture = statusEvents({ unchanged: true });
  assert.equal((await fixture.patch()).status, 200);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.notifications.length, 0);
  await fixture.load('src/lib/notifications/events.ts').notifyStatusChange(
    { id: 'post', title: 'Feedback', authorId: 'author' }, fixture.oldStatus, fixture.oldStatus, 'org', 'actor',
  );
  assert.equal(fixture.notifications.length, 0);
});
for (const [options, status] of [
  [{ authorized: false }, 401], [{ member: false }, 403], [{ foreignStatus: true }, 404],
  [{ failSave: true }, 500], [{ conflict: true }, 409],
] as const) {
  test(`status change emits nothing on rejected/failed update: ${JSON.stringify(options)}`, async () => {
    const fixture = statusEvents(options);
    assert.equal((await fixture.patch()).status, status);
    assert.equal(fixture.notifications.length, 0);
  });
}
test('status notification failure does not break the successful request', async () => {
  const fixture = statusEvents({ failNotify: true });
  assert.equal((await fixture.patch()).status, 200);
  assert.equal(fixture.writes(), 1);
});

test('status delivery is registered with the request lifecycle and completes on close', async () => {
  const fixture = statusEvents();
  assert.equal((await fixture.handlePatch()).status, 200);
  assert.equal(fixture.afterTasks.length, 1);
  assert.equal(fixture.notifications.length, 0);
  await fixture.finishRequest();
  assert.deepEqual(fixture.notifications.map(n => n.userId), ['author', 'voter']);
  assert.deepEqual(fixture.emails.map(n => n.userId), ['author', 'voter']);
});
for (const recipientMembers of [[], ['author'], ['voter']]) {
  test(`status recipients outside organization get in-app only (members=${recipientMembers})`, async () => {
    const fixture = statusEvents({ recipientMembers });
    assert.equal((await fixture.patch()).status, 200);
    assert.deepEqual(fixture.notifications.map(n => n.userId), ['author', 'voter']);
    assert.deepEqual(fixture.emails.map(n => n.userId), recipientMembers);
  });
}
test('status PATCH rejects malformed JSON before writing or scheduling notifications', async () => {
  const fixture = statusEvents();
  const response = await fixture.handlePatch('{');
  assert.equal(response.status, 400);
  assert.equal(fixture.writes(), 0);
  assert.equal(fixture.afterTasks.length, 0);
  assert.equal(fixture.notifications.length, 0);
});
