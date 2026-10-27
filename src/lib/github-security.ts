import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyGitHubSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature.slice(7), 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// Restrict repository components so they cannot change the API host or path.
export function githubRepository(owner: unknown, repo: unknown): string | null {
  if (typeof owner !== 'string' || typeof repo !== 'string' ||
      !/^[a-z0-9-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(repo) ||
      repo === '.' || repo === '..') return null;
  return `${owner}/${repo}`.toLowerCase();
}

export function githubPostWhere(postId: string, organizationId: string) {
  return { id: postId, board: { organizationId } };
}

export function githubSyncWhere(integrationId: string, repository: string, issueNumber: number) {
  return {
    integrationId,
    entityType: 'post',
    externalId: String(issueNumber),
    // Bind legacy mappings to their original repository even after config changes.
    externalUrl: {
      equals: `https://github.com/${repository}/issues/${issueNumber}`,
      mode: 'insensitive' as const,
    },
  };
}
