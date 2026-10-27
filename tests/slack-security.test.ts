import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac, randomBytes } from 'node:crypto';
import { isSlackWebhookUrl, verifySlackRequest } from '../src/lib/slack-security';

const now = 1_800_000_000_000;
const secret = randomBytes(32).toString('hex');
function sign(raw: string, timestamp: string) {
  return 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex');
}
test('signature verification authenticates the exact bytes, including form encoding', () => {
  const raw = 'text=a%20b%7Cc&team_id=TEXAMPLE';
  const timestamp = String(now / 1000);
  const signature = sign(raw, timestamp);
  assert.equal(verifySlackRequest(raw, timestamp, signature, secret, now), true);
  assert.equal(verifySlackRequest(raw.replace('%20', '+'), timestamp, signature, secret, now), false);
  assert.equal(verifySlackRequest(raw, timestamp, 'v0=' + '0'.repeat(64), secret, now), false);
});
test('timestamp window includes five minutes and rejects malformed timestamps', () => {
  const raw = 'text=feedback';
  for (const age of [-301, -300, 0, 300, 301]) {
    const timestamp = String(now / 1000 - age);
    assert.equal(verifySlackRequest(raw, timestamp, sign(raw, timestamp), secret, now), Math.abs(age) <= 300);
  }
  for (const timestamp of [null, '', 'NaN', 'Infinity', '1e9', '1800000000.0', ' 1800000000', '9007199254740992']) {
    assert.equal(verifySlackRequest(raw, timestamp, sign(raw, timestamp ?? ''), secret, now), false);
  }
});
test('URL policy permits only HTTPS Slack hooks without credentials or alternate ports', () => {
  assert.equal(isSlackWebhookUrl('https://hooks.slack.com/services/test'), true);
  for (const url of [null, {}, '', '//hooks.slack.com/test', 'https://hooks.slack.com./test', 'https://hooks.slack.com/test#fragment', 'https://hooks.slack.com@localhost/test', 'https://[::1]/test']) {
    assert.equal(isSlackWebhookUrl(url), false);
  }
});
