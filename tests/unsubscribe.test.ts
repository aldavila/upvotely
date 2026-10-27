import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { NextResponse } from 'next/server';
import { loadSource } from './helpers';

type Route = { GET: (req: Request, context: { params: Promise<{ postId: string }> }) => Promise<Response> };
const secret = randomBytes(32).toString('hex');
const signature = (userId: string, postId: string) => createHmac('sha256', secret).update(JSON.stringify([userId, postId])).digest('hex');

async function request(query: string, postId = 'post-a', configured = true) {
  const writes: unknown[] = [];
  const route = loadSource<Route>('src/app/api/unsubscribe/[postId]/route.ts', {
    'next/server': { NextResponse },
    '@/lib/db': { db: { postSubscription: { upsert: async (args: unknown) => { writes.push(args); } } } },
  }, configured ? { UNSUBSCRIBE_TOKEN_SECRET: secret } : {});
  const response = await route.GET(new Request(`https://app.example.test/api/unsubscribe/${postId}?${query}`), {
    params: Promise.resolve({ postId }),
  });
  return { response, writes };
}

for (const [name, query, postId, configured] of [
  ['missing signature', 'userId=user-a', 'post-a', true],
  ['invalid signature', 'userId=user-a&token=invalid', 'post-a', true],
  ['wrong signature of correct length', `userId=user-a&token=${'0'.repeat(64)}`, 'post-a', true],
  ['changed user', `userId=user-b&token=${signature('user-a', 'post-a')}`, 'post-a', true],
  ['changed post', `userId=user-a&token=${signature('user-a', 'post-a')}`, 'post-b', true],
  ['missing secret', `userId=user-a&token=${signature('user-a', 'post-a')}`, 'post-a', false],
] as const) {
  test(`unsubscribe rejects ${name} before database access`, async () => {
    const { response, writes } = await request(query, postId, configured);
    assert.equal(response.status, 401);
    assert.equal(writes.length, 0);
  });
}

test('a valid signature unsubscribes only the bound user and post', async () => {
  const { response, writes } = await request(`userId=user-a&token=${signature('user-a', 'post-a')}`);
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(writes)), [{
    where: { postId_userId: { postId: 'post-a', userId: 'user-a' } },
    create: { postId: 'post-a', userId: 'user-a', isSubscribed: false },
    update: { isSubscribed: false },
  }]);
});
