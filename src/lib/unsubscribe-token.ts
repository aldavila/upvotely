import { createHmac, timingSafeEqual } from 'node:crypto';

export function createUnsubscribeToken(userId: string, postId: string, secret: string): string {
  if (!secret) throw new Error('UNSUBSCRIBE_TOKEN_SECRET is required');
  return createHmac('sha256', secret).update(JSON.stringify([userId, postId])).digest('hex');
}

export function verifyUnsubscribeToken(
  userId: string,
  postId: string,
  token: string | null,
  secret: string | undefined
): boolean {
  if (!secret || !userId || !postId || !token || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = Buffer.from(createUnsubscribeToken(userId, postId, secret), 'hex');
  const supplied = Buffer.from(token, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
