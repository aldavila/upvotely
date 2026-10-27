import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function verifySlackRequest(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  now = Date.now()
): boolean {
  if (!secret || !timestamp || !/^\d+$/.test(timestamp) || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isSafeInteger(seconds) || Math.abs(now / 1000 - seconds) > 300) return false;
  const expected = Buffer.from(`v0=${createHmac('sha256', secret)
    .update(`v0:${timestamp}:${rawBody}`).digest('hex')}`);
  const actual = Buffer.from(signature);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isSlackWebhookUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'hooks.slack.com'
      && !url.port && !url.username && !url.password && !url.hash;
  } catch {
    return false;
  }
}

export function hashSlackConnectionCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}
