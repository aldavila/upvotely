import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deferred, loadSource, tick } from './helpers';

type Route = { PATCH: (req: Request, context: { params: Promise<{ postId: string }> }) => Promise<Response> };
const statusId = 'c' + 'a'.repeat(24);
const oldStatusId = 'c' + 'b'.repeat(24);

function setup(options: { memberOrg?: string; role?: string; statusOrg?: string; unchanged?: boolean; notify?: () => Promise<unknown>; anonymous?: boolean } = {}) {
  const state = { updates: 0, notifications: [] as unknown[][] };
  const post = { id: 'post-a', statusId: options.unchanged ? statusId : oldStatusId, status: { name: 'Open' }, board: { organizationId: 'org-a' } };
  const db = {
    organizationMember: { findFirst: async ({ where }: { where: { userId: string; organizationId?: string; role?: { in: string[] } } }) => {
      const member = { userId: 'admin-a', organizationId: options.memberOrg ?? 'org-a', role: options.role ?? 'admin' };
      return member.userId === where.userId && (!where.organizationId || member.organizationId === where.organizationId) && (!where.role || where.role.in.includes(member.role)) ? member : null;
    } },
    post: {
      findUnique: async () => post,
      update: async () => { state.updates++; return { ...post, statusId }; },
    },
    status: { findUnique: async () => ({ id: statusId, name: 'Done', organizationId: options.statusOrg ?? 'org-a' }) },
  };
  const route = loadSource<Route>('src/app/api/posts/[postId]/status/route.ts', {
    'next/server': { NextResponse }, zod: { z }, '@/lib/db': { db },
    '@/lib/auth': { auth: async () => options.anonymous ? null : { user: { id: 'admin-a' } } },
    '@/lib/notifications/voter-status': { notifyVotersOnStatusChange: async (...args: unknown[]) => {
      state.notifications.push(args);
      await options.notify?.();
    } },
  });
  return { state, run: () => route.PATCH(new Request('https://app.example.test/api/posts/post-a/status', {
    method: 'PATCH', body: JSON.stringify({ statusId }),
  }), { params: Promise.resolve({ postId: 'post-a' }) }) };
}

test('an admin of another organization cannot update the post', async () => {
  const { run, state } = setup({ memberOrg: 'org-b' });
  assert.equal((await run()).status, 403);
  assert.equal(state.updates, 0);
  assert.equal(state.notifications.length, 0);
});

test('a status from another organization cannot be assigned', async () => {
  const { run, state } = setup({ statusOrg: 'org-b' });
  assert.equal((await run()).status, 404);
  assert.equal(state.updates, 0);
});

test('an unchanged status causes no write or notifications', async () => {
  const { run, state } = setup({ unchanged: true });
  assert.equal((await run()).status, 200);
  assert.equal(state.notifications.length, 0);
  assert.equal(state.updates, 0);
});

test('the route waits for notification delivery before returning', async () => {
  const gate = deferred();
  const { run, state } = setup({ notify: () => gate.promise });
  let returned = false;
  const pending = run().then((response) => { returned = true; return response; });
  await tick();
  try { assert.equal(returned, false); } finally { gate.resolve(); await pending; }
  assert.equal(state.updates, 1);
  assert.equal(state.notifications[0][1], 'org-a');
});

test('a delivery failure does not turn a saved status into a failed request', async () => {
  const { run, state } = setup({ notify: async () => { throw new Error('Fake delivery failure'); } });
  assert.equal((await run()).status, 200);
  assert.equal(state.updates, 1);
});

for (const role of ['owner', 'admin', 'member']) {
  test(`same-organization ${role} authorization`, async () => {
    const { run, state } = setup({ role });
    assert.equal((await run()).status, role === 'member' ? 403 : 200);
    assert.equal(state.updates, role === 'member' ? 0 : 1);
  });
}

test('anonymous callers cannot update status', async () => {
  const { run, state } = setup({ anonymous: true });
  assert.equal((await run()).status, 401);
  assert.equal(state.updates, 0);
});
