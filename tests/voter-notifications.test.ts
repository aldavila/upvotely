import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { deferred, tick } from './helpers';
import { loadSource } from './load-source';

type Preference = { userId: string; organizationId: string; emailStatusChange: boolean; inAppStatusChange: boolean };
type Notifier = { notifyVotersOnStatusChange: (postId: string, orgId: string, oldStatus: string, newStatus: string) => Promise<unknown> };
type Email = { to: string; html: string; subject: string };

function setup(options: { preferences?: Preference[]; title?: string; status?: string; delivery?: (email: Email) => Promise<void>; inAppDelivery?: () => Promise<void>; unsubscribed?: string[]; provider?: string } = {}) {
  const emails: Email[] = [];
  const notifications: { userId: string }[] = [];
  const requests: RequestInit[] = [];
  const secret = randomBytes(32).toString('hex');
  const preferences = options.preferences ?? [];
  const findPreference = async ({ where }: { where: { userId?: string; organizationId?: string; userId_organizationId?: { userId: string; organizationId: string } } }) => {
    const filter = where.userId_organizationId ?? where;
    return preferences.find(p => p.userId === filter.userId && (!filter.organizationId || p.organizationId === filter.organizationId)) ?? null;
  };
  const db = {
    vote: { findMany: async () => [{ userId: 'user-a' }, { userId: 'user-b' }] },
    post: { findUnique: async () => ({ id: 'post-a', title: options.title ?? 'A feature', boardId: 'board-a', authorId: null }) },
    postSubscription: { findMany: async () => (options.unsubscribed ?? []).map(userId => ({ userId })) },
    notification: { create: async ({ data }: { data: { userId: string } }) => { await options.inAppDelivery?.(); notifications.push(data); } },
    user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, email: `${where.id}@example.test` }) },
    organizationMember: { findMany: async () => [{ userId: 'user-a' }, { userId: 'user-b' }] },
    notificationPreference: { findFirst: findPreference, findUnique: findPreference },
  };
  const notifier: Notifier = loadSource('src/lib/notifications/voter-status.ts', { '@/lib/db': { db } }, {
    EMAIL_PROVIDER: options.provider ?? 'resend', RESEND_API_KEY: randomBytes(16).toString('hex'),
    SENDGRID_API_KEY: randomBytes(16).toString('hex'), NEXTAUTH_URL: 'https://app.example.test',
    UNSUBSCRIBE_TOKEN_SECRET: secret,
  }, async (_url, init) => {
    requests.push(init!);
    const payload = JSON.parse(init!.body as string);
    const email: Email = options.provider === 'sendgrid'
      ? { to: payload.personalizations[0].to[0].email, html: payload.content[0].value, subject: payload.subject }
      : payload;
    emails.push(email);
    await options.delivery?.(email);
    return new Response(null, { status: 202 });
  });
  return { emails, notifications, requests, secret, run: async () => {
    const result = await notifier.notifyVotersOnStatusChange('post-a', 'org-a', 'Open', options.status ?? 'Done');
    return result;
  } };
}

test('email HTML escapes hostile post titles and status names', async () => {
  const { run, emails } = setup({ title: '<img src=x onerror="bad()"> & \'title\'', status: '<script>bad()</script>' });
  await run(); await tick();
  assert.equal(emails.length, 2);
  assert.ok(emails[0].html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; &#39;title&#39;'));
  assert.ok(emails[0].html.includes('&lt;script&gt;bad()&lt;/script&gt;'));
  assert.ok(!emails[0].html.includes('<img'));
});

test('email opt-out is read from the post organization even when another preference comes first', async () => {
  const { run, emails, notifications } = setup({ preferences: [
    { userId: 'user-a', organizationId: 'org-b', emailStatusChange: true, inAppStatusChange: true },
    { userId: 'user-a', organizationId: 'org-a', emailStatusChange: false, inAppStatusChange: true },
  ] });
  await run(); await tick();
  assert.deepEqual(emails.map(e => e.to), ['user-b@example.test']);
  assert.equal(notifications.length, 2);
});

test('in-app opt-out is independent of email preferences and other organizations', async () => {
  const { run, emails, notifications } = setup({ preferences: [
    { userId: 'user-a', organizationId: 'org-b', emailStatusChange: false, inAppStatusChange: true },
    { userId: 'user-a', organizationId: 'org-a', emailStatusChange: true, inAppStatusChange: false },
  ] });
  await run(); await tick();
  assert.deepEqual(notifications.map(n => n.userId), ['user-b']);
  assert.equal(emails.length, 2);
});

test('notification helper waits for email delivery to settle', async () => {
  const gate = deferred();
  const { run, emails } = setup({ delivery: () => gate.promise });
  let returned = false;
  const pending = run().then(() => { returned = true; });
  await tick();
  try { assert.equal(returned, false); } finally { gate.resolve(); await pending; }
  assert.equal(emails.length, 2);
});

test('one email failure does not skip remaining deliveries', async () => {
  const { run, emails } = setup({ delivery: async email => {
    if (email.to === 'user-a@example.test') throw new Error('Fake email failure');
  } });
  await run(); await tick();
  assert.equal(emails.length, 2);
});

test('in-app failure does not skip email deliveries', async () => {
  const { run, emails } = setup({ inAppDelivery: async () => { throw new Error('Fake in-app failure'); } });
  await run();
  assert.equal(emails.length, 2);
});

test('post unsubscribe suppresses both channels while missing preferences default on', async () => {
  const { run, emails, notifications } = setup({ unsubscribed: ['user-a'] });
  await run(); await tick();
  assert.deepEqual(notifications.map(n => n.userId), ['user-b']);
  assert.deepEqual(emails.map(e => e.to), ['user-b@example.test']);
});

test('generated unsubscribe links carry a signature bound to recipient and post', async () => {
  const { run, emails, secret } = setup();
  await run(); await tick();
  const href = emails[0].html.match(/href="([^"]*\/api\/unsubscribe\/[^\"]+)"/)![1].replaceAll('&amp;', '&');
  const link = new URL(href);
  assert.equal(link.searchParams.get('userId'), 'user-a');
  const expected = createHmac('sha256', secret).update(JSON.stringify(['user-a', 'post-a'])).digest('hex');
  assert.equal(link.searchParams.get('token') === expected, true);
});

for (const provider of ['resend', 'sendgrid']) {
  test(`${provider} delivery never follows redirects`, async () => {
    const { run, requests } = setup({ provider });
    await run(); await tick();
    assert.equal(requests.length, 2);
    assert.ok(requests.every(r => r.redirect === 'manual'));
  });
}
