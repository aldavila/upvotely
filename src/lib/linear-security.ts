import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyLinearSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function isFreshLinearTimestamp(timestamp: unknown, now: number): boolean {
  return typeof timestamp === 'number' && Number.isFinite(timestamp) && Math.abs(now - timestamp) <= 60_000;
}

export function organizationPostWhere(postId: string, organizationId: string) {
  return { id: postId, board: { organizationId } };
}

export function linearSyncWhere(issueId: string, teamId: string) {
  return {
    entityType: 'post',
    // Existing mappings already carry the immutable ID here; externalId is a display identifier.
    metadata: { path: ['linearIssueId'], equals: issueId },
    integration: {
      type: 'linear',
      isActive: true,
      config: { path: ['teamId'], equals: teamId },
    },
  };
}
