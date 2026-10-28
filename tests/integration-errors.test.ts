import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { load } from './load';

const jsonResponse = { NextResponse: { json: (body: unknown, init?: ResponseInit) => Response.json(body, init) } };

for (const provider of ['github', 'linear']) {
  for (const method of ['GET', 'POST', 'DELETE']) {
    test(`${provider} config ${method} does not log secret-bearing database errors`, async () => {
      const secret = randomBytes(32).toString('hex');
      const token = randomBytes(32).toString('hex');
      const logs: unknown[][] = [];
      const fail = async () => { throw new Error(`Invalid config ${secret} ${token}`); };
      const route = load(`src/app/api/integrations/${provider}/route.ts`, {
        'next/server': jsonResponse,
        '@/lib/auth': { auth: async () => ({ user: { id: 'user-a' } }) },
        '@/lib/db': { db: {
          organizationMember: { findFirst: async () => ({ organizationId: 'org-a' }) },
          integration: { findUnique: fail, upsert: fail, deleteMany: fail },
        } },
      }, { console: { error: (...args: unknown[]) => logs.push(args) } });
      const response = await route[method](new Request('https://app.example/config', {
        method: 'POST', body: JSON.stringify({
          owner: 'example', repo: 'repo', accessToken: token,
          apiKey: token, teamId: 'team-a', webhookSecret: secret,
        }),
      }));
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: 'Internal server error' });
      assert.deepEqual(logs, [[`${method === 'GET' ? 'Get' : method === 'POST' ? 'Save' : 'Delete'} ${provider === 'github' ? 'GitHub' : 'Linear'} integration error`]]);
    });
  }
}
