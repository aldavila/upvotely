import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { load } from './load';

const configPath = 'src/app/api/webhooks/route.ts';
const retryPath = 'src/app/api/webhooks/events/[eventId]/retry/route.ts';
const deliveryPath = 'src/lib/webhooks/index.ts';
const payload = { event: 'post.created', timestamp: '2026-01-01T00:00:00.000Z', data: {} };
const publicAddress = { address: '2003:db8::1', family: 6 }; // Synthetic DNS answer; never contacted.
const jsonResponse = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };
function fixture() {
  const org = { webhookUrl: 'https://receiver.example/hook', webhookSecret: null as string | null, webhookEvents: [] };
  const state = { status: 'failed', deliveries: 0, writes: 0, payload: payload as unknown };
  const db = {
    organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) },
    organization: {
      findUnique: async () => org,
      update: async ({ data }: any) => { state.writes++; Object.assign(org, data); return org; },
    },
    webhookEvent: {
      findFirst: async ({ where }: any) => where.organizationId === 'org-a' ? { id: 'event-a', payload: state.payload } : null,
      update: async ({ data }: any) => { Object.assign(state, data); },
      updateMany: async ({ where, data }: any) => {
        if (where.id !== 'event-a' || where.organizationId !== 'org-a' || where.status !== state.status) return { count: 0 };
        Object.assign(state, data);
        return { count: 1 };
      },
    },
  };
  const mocks: Record<string, any> = {
    'next/server': jsonResponse,
    '@/lib/auth': { auth: async () => ({ user: { id: 'user-a' } }) },
    '@/lib/db': { db },
    'node:dns/promises': { lookup: async () => [publicAddress] },
    'node:https': { request: () => { throw new Error('Unexpected request'); } },
  };
  return { org, state, db, mocks };
}
const put = (body: unknown) => new Request('https://app.example/api/webhooks', { method: 'PUT', body: JSON.stringify(body) });
const retryArgs = [new Request('https://app.example/retry', { method: 'POST' }), { params: Promise.resolve({ eventId: 'event-a' }) }] as const;

function assertNoStoredSecret(body: unknown, secret: string) {
  const serialized = JSON.stringify(body);
  for (const fragment of [secret, secret.slice(0, 10), secret.slice(-4)]) {
    assert.equal(serialized.includes(fragment), false);
  }
  assert.equal(serialized.includes('secretPreview'), false);
  assert.equal(serialized.includes('webhookSecret'), false);
}

for (const configured of [false, true]) {
  test(`GET reports secret presence only (${configured})`, async () => {
    const f = fixture();
    const secret = `whsec_${randomBytes(24).toString('hex')}`;
    f.org.webhookSecret = configured ? secret : null;
    const response = await load(configPath, f.mocks).GET();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body, { webhookUrl: f.org.webhookUrl, webhookEvents: [], hasSecret: configured });
    assertNoStoredSecret(body, secret);
  });
}

test('save rejects unsafe URLs before writing configuration', async () => {
  const f = fixture();
  const route = load(configPath, f.mocks);
  for (const webhookUrl of ['http://receiver.example/hook', 'https://127.0.0.1', 'https://[::1]', 'https://user:password@receiver.example']) {
    assert.equal((await route.PUT(put({ webhookUrl }))).status, 400);
  }
  assert.equal(f.state.writes, 0);
});

test('save rejects a hostname resolving to a private address', async () => {
  const f = fixture();
  f.mocks['node:dns/promises'].lookup = async () => [{ address: '10.0.0.1', family: 4 }];
  assert.equal((await load(configPath, f.mocks).PUT(put({ webhookUrl: f.org.webhookUrl }))).status, 400);
  assert.equal(f.state.writes, 0);
});

test('delivery rejects unsafe destinations without making requests', async () => {
  const f = fixture();
  let requests = 0;
  const delivery = load(deliveryPath, f.mocks, { fetch: async () => { requests++; return new Response('internal data'); } });
  await delivery.deliverWithRetry('event-a', 'https://127.0.0.1', null, payload, 1);
  assert.equal(requests, 0);
  assert.equal(f.state.status, 'failed');
});

for (const status of [200, 302, 500]) {
  test(`delivery pins validated DNS, never follows redirects or logs response bodies (${status})`, async () => {
    const f = fixture();
    let requests = 0;
    let pinned = false;
    f.mocks['node:https'].request = (_url: URL, options: any, callback: (res: any) => void) => {
      requests++;
      options.lookup('receiver.example', {}, (_error: unknown, address: string, family: number) => {
        pinned = address === publicAddress.address && family === publicAddress.family;
      });
      const request = new EventEmitter() as any;
      request.end = () => callback({ statusCode: status, headers: { location: 'https://127.0.0.1' }, destroy() {} });
      return request;
    };
    const delivery = load(deliveryPath, f.mocks, { fetch: async (_url: string, init: RequestInit) => {
      requests++;
      assert.equal(init.redirect, 'manual');
      return new Response('private response content', { status });
    } });
    await delivery.deliverWithRetry('event-a', f.org.webhookUrl, null, payload, 1);
    assert.equal(requests, 1);
    assert.equal(pinned, true);
    assert.equal((f.state as any).response, String(status));
    assert.equal(f.state.status, status === 200 ? 'sent' : 'failed');
  });
}

for (const regenerateSecret of [false, true]) {
  test(`create/rotate returns a usable secret once; subsequent reads and saves mask it (${regenerateSecret})`, async () => {
    const f = fixture();
    const previous = regenerateSecret ? randomBytes(24).toString('hex') : null;
    f.org.webhookSecret = previous;
    const route = load(configPath, f.mocks);
    const created = await route.PUT(put({ webhookUrl: f.org.webhookUrl, regenerateSecret }));
    const body = await created.json();
    assert.equal(created.status, 200);
    assert.equal(created.headers.get('Cache-Control'), 'no-store');
    assert.equal(body.hasSecret, true);
    assert.deepEqual(Object.keys(body).sort(), ['hasSecret', 'secret', 'webhookEvents', 'webhookUrl']);
    assert.equal(typeof body.secret, 'string');
    assert.equal(body.secret, f.org.webhookSecret);
    assert.notEqual(body.secret, previous);
    const raw = JSON.stringify(payload);
    assert.equal(createHmac('sha256', body.secret).update(raw).digest('hex'), createHmac('sha256', f.org.webhookSecret!).update(raw).digest('hex'));
    for (const response of [await route.GET(), await route.PUT(put({ webhookEvents: ['post.created'] }))]) {
      const later = await response.json();
      assert.equal(later.secret, undefined);
      assert.equal(later.hasSecret, true);
      assertNoStoredSecret(later, body.secret);
      if (previous) assertNoStoredSecret(later, previous);
    }
  });
}

test('generation and update errors do not log the secret', async () => {
  const f = fixture();
  const secret = `whsec_${randomBytes(24).toString('hex')}`;
  const logs: unknown[] = [];
  f.mocks['@/lib/webhooks'] = { generateWebhookSecret: () => secret };
  const route = load(configPath, f.mocks, { console: { error: (...args: unknown[]) => logs.push(args) } });
  const created = await route.PUT(put({ regenerateSecret: true }));
  assert.equal((await created.json()).secret, secret);
  assert.deepEqual(logs, []);
  f.db.organization.update = async () => { throw new Error(`Cannot save ${secret}`); };
  const failed = await route.PUT(put({ regenerateSecret: true }));
  assert.equal(failed.status, 500);
  assertNoStoredSecret(await failed.json(), secret);
  assertNoStoredSecret(logs, secret);
  assert.equal(logs.length, 1);
});

test('retry rejects malformed stored payloads before claiming or delivering', async () => {
  const f = fixture();
  f.state.payload = { ...payload, event: 'unknown.event' };
  f.mocks['@/lib/webhooks'] = { deliverWithRetry: async () => { f.state.deliveries++; } };
  const response = await load(retryPath, f.mocks).POST(...retryArgs);
  assert.equal(response.status, 400);
  assert.equal(f.state.status, 'failed');
  assert.equal(f.state.deliveries, 0);
});

test('concurrent retries claim a failed event only once and await completion', async () => {
  const f = fixture();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  f.mocks['@/lib/webhooks'] = { deliverWithRetry: async () => {
    f.state.deliveries++;
    await held;
    f.state.status = 'sent';
  } };
  const route = load(retryPath, f.mocks);
  let successes = 0;
  const pending = [route.POST(...retryArgs), route.POST(...retryArgs)].map(async p => {
    const response = await p;
    if (response.status === 200) successes++;
    return response;
  });
  await new Promise(resolve => setImmediate(resolve));
  const completedEarly = successes;
  release();
  const responses = await Promise.all(pending);
  assert.equal(completedEarly, 0);
  assert.equal(f.state.deliveries, 1);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal((await route.POST(...retryArgs)).status, 409);
  assert.equal(f.state.deliveries, 1);
});

test('retry cannot claim an event owned by another organization', async () => {
  const f = fixture();
  f.db.organizationMember.findFirst = async () => ({ organizationId: 'org-b' });
  f.mocks['@/lib/webhooks'] = { deliverWithRetry: async () => { f.state.deliveries++; } };
  assert.equal((await load(retryPath, f.mocks).POST(...retryArgs)).status, 404);
  assert.equal(f.state.deliveries, 0);
});

test('organization listing does not expose the stored webhook secret', async () => {
  const f = fixture();
  f.org.webhookSecret = randomBytes(24).toString('hex');
  (f.db.organizationMember as any).findMany = async () => [{ organization: f.org, role: 'owner' }];
  const response = await load('src/app/api/organizations/route.ts', f.mocks).GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body[0].webhookSecret, 'undefined');
  assertNoStoredSecret(body, f.org.webhookSecret);
});

test('delivery revalidates DNS after save and on every retry', async () => {
  const f = fixture();
  const route = load(configPath, f.mocks);
  assert.equal((await route.PUT(put({ webhookUrl: f.org.webhookUrl }))).status, 200);
  let lookups = 0;
  let requests = 0;
  f.mocks['node:dns/promises'].lookup = async () => {
    lookups++;
    return lookups === 1 ? [publicAddress] : [{ address: '127.0.0.1', family: 4 }];
  };
  f.mocks['node:https'].request = () => {
    requests++;
    const request = new EventEmitter() as any;
    request.end = () => request.emit('error', new Error('receiver-controlled error detail'));
    return request;
  };
  await load(deliveryPath, f.mocks).deliverWithRetry('event-a', f.org.webhookUrl, null, payload, 3);
  assert.equal(lookups, 3);
  assert.equal(requests, 1);
  assert.equal(f.state.status, 'failed');
  assert.equal((f.state as any).response, 'Webhook delivery failed');
});

test('the one-time secret verifies the exact bytes sent by delivery', async () => {
  const f = fixture();
  const response = await load(configPath, f.mocks).PUT(put({ regenerateSecret: true }));
  const { secret } = await response.json();
  let verified = false;
  f.mocks['node:https'].request = (_url: URL, options: any, callback: (res: any) => void) => {
    const request = new EventEmitter() as any;
    request.end = (body: string) => {
      verified = options.headers['X-Webhook-Signature'] === `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
      callback({ statusCode: 204, destroy() {} });
    };
    return request;
  };
  await load(deliveryPath, f.mocks).deliverWithRetry('event-a', f.org.webhookUrl, f.org.webhookSecret, payload, 1);
  assert.equal(verified, true);
  assert.equal(f.state.status, 'sent');
});

test('unauthenticated callers and non-admin members cannot read, rotate or retry', async () => {
  for (const authenticated of [false, true]) {
    const f = fixture();
    f.mocks['@/lib/auth'].auth = async () => authenticated ? { user: { id: 'user-a' } } : null;
    f.mocks['@/lib/db'].db.organizationMember.findFirst = async ({ where }: any) => {
      assert.deepEqual(Array.from(where.role.in), ['owner', 'admin']);
      return null;
    };
    const route = load(configPath, f.mocks);
    const retry = load(retryPath, f.mocks);
    for (const response of [await route.GET(), await route.PUT(put({ regenerateSecret: true })), await retry.POST(...retryArgs)]) {
      assert.equal(response.status, authenticated ? 403 : 401);
    }
    assert.equal(f.state.writes, 0);
    assert.equal(f.state.status, 'failed');
  }
});
