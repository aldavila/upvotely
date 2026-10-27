import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicAddress, validateWebhookUrl } from '../src/lib/webhook-policy';
import { isWebhookPayload, type WebhookPayload } from '../src/lib/webhook-payload';

const publicAddress = { address: '2003:db8::1', family: 6 }; // Synthetic; no network calls.

test('address policy blocks nonpublic IPv4 and IPv6, including transition addresses', () => {
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.254', '127.0.0.1',
    '169.254.1.1', '172.16.0.1', '172.31.255.254', '192.0.0.1', '192.0.2.1',
    '192.88.99.1', '192.168.0.1', '198.18.0.1', '198.19.255.254', '198.51.100.1',
    '203.0.113.1', '224.0.0.1', '239.255.255.254', '240.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:a00:1', '64:ff9b::a00:1', '64:ff9b:1::1',
    '100::1', '2001::1', '2001:2::1', '2001:db8::1', '2002:7f00:1::',
    '3fff::1', 'fc00::1', 'fd00::1', 'fe80::1', 'ff00::1', '4000::1', 'invalid',
  ]) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress(publicAddress.address), true);
});

test('URL policy handles encoded IPv4 and rejects credentials and non-HTTPS schemes', async () => {
  for (const url of [
    'http://receiver.example', 'file:///example', 'ftp://receiver.example',
    'https://user:password@receiver.example', 'https://2130706433', 'https://0x7f000001',
    'https://127.1', 'https://[::ffff:127.0.0.1]',
  ]) await assert.rejects(validateWebhookUrl(url, async () => [publicAddress]));
});

test('DNS policy rejects empty, mixed, malformed and failed lookups', async () => {
  for (const addresses of [
    [], [publicAddress, { address: '127.0.0.1', family: 4 }],
    [{ address: 'invalid', family: 4 }], [{ ...publicAddress, family: 4 }],
  ]) await assert.rejects(validateWebhookUrl('https://receiver.example', async () => addresses));
  await assert.rejects(validateWebhookUrl('https://receiver.example', async () => { throw new Error('DNS failure'); }));
  const destination = await validateWebhookUrl('https://receiver.example/hook', async () => [publicAddress]);
  assert.equal(destination.url.hostname, 'receiver.example');
  assert.deepEqual(destination.addresses, [publicAddress]);
});

test('stored payload validation narrows event strings to the delivery type', () => {
  const candidate = { event: String('post.created'), timestamp: '2026-01-01', data: {} };
  assert.ok(isWebhookPayload(candidate));
  const narrowed: WebhookPayload = candidate;
  assert.equal(narrowed.event, 'post.created');
  for (const value of [null, [], {}, { ...candidate, event: 'unknown' },
    { ...candidate, timestamp: 1 }, { ...candidate, data: [] }, { ...candidate, data: null }]) {
    assert.equal(isWebhookPayload(value), false);
  }
});
