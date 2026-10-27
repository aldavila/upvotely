import { db } from '@/lib/db';
import { githubRepository } from '../github-security';

interface GitHubIssueData {
  title: string;
  body: string;
  labels?: string[];
}

// Only org admins may request this through the issue route, after checking
// GitHub. null explicitly confirms that no issue was created (including in a
// previously configured repository); a number links an issue verified below.
interface PendingResolution {
  issueNumber: number | null;
  confirmed: true;
}

export async function getGitHubConfig(organizationId: string) {
  const integration = await db.integration.findUnique({
    where: { organizationId_type: { organizationId, type: 'github' } },
  });
  if (!integration?.isActive) return null;
  return {
    integration,
    config: integration.config as {
      accessToken: string;
      owner: string;
      repo: string;
      defaultLabels?: string[];
    },
  };
}

export async function createGitHubIssue(
  organizationId: string,
  postId: string,
  data: GitHubIssueData,
  resolvePending?: PendingResolution
): Promise<{ issueNumber: number; issueUrl: string } | null> {
  const result = await getGitHubConfig(organizationId);
  if (!result) return null;

  const { integration, config } = result;
  const repository = githubRepository(config.owner, config.repo);
  if (!repository) return null;

  try {
    const where = {
      integrationId_entityType_entityId: {
        integrationId: integration.id,
        entityType: 'post',
        entityId: postId,
      },
    };
    const existing = await db.integrationSync.findUnique({ where });
    if (existing) {
      if (existing.status === 'synced' && existing.externalUrl && existing.externalId) {
        return { issueNumber: Number(existing.externalId), issueUrl: existing.externalUrl };
      }
      // Never automatically expire an ambiguous result. An admin can resolve a
      // stale reservation without disconnecting or deleting other issue links.
      if (existing.status !== 'pending' || !resolvePending?.confirmed ||
          !(Date.now() - existing.createdAt.getTime() >= 15 * 60 * 1000)) return null;
      if (resolvePending.issueNumber !== null) {
        const original = (existing.metadata as { repository?: string } | null)?.repository;
        const parts = (original || repository).split('/');
        const issueRepository = parts.length === 2 ? githubRepository(parts[0], parts[1]) : null;
        if (!issueRepository) return null;
        const response = await fetch(`https://api.github.com/repos/${issueRepository}/issues/${resolvePending.issueNumber}`, {
          method: 'GET', redirect: 'manual',
          headers: { Authorization: `Bearer ${config.accessToken}`, Accept: 'application/vnd.github.v3+json' },
        });
        if (!response.ok) return null;
        const issue = await response.json();
        if (issue.number !== resolvePending.issueNumber || issue.pull_request) return null;
        const issueUrl = `https://github.com/${issueRepository}/issues/${issue.number}`;
        const updated = await db.integrationSync.updateMany({
          where: { id: existing.id, status: 'pending' },
          data: { externalId: String(issue.number), externalUrl: issueUrl, status: 'synced' },
        });
        return updated.count ? { issueNumber: issue.number, issueUrl } : null;
      }
      const removed = await db.integrationSync.deleteMany({ where: { id: existing.id, status: 'pending' } });
      if (!removed.count) return null;
    }

    // The unique mapping reserves this export across concurrent workers. Keep
    // pending reservations on ambiguous failures: retrying could duplicate an
    // issue created before the response or DB write failed.
    const reservation = await db.integrationSync.create({
      data: {
        integrationId: integration.id,
        entityType: 'post',
        entityId: postId,
        externalId: '',
        direction: 'outbound',
        status: 'pending',
        metadata: { repository },
      },
    });
    const response = await fetch(
      `https://api.github.com/repos/${repository}/issues`,
      {
        method: 'POST',
        redirect: 'manual',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: data.title,
          body: `${data.body}\n\n---\n*Created from Upvotely feedback*`,
          labels: [...(config.defaultLabels || []), ...(data.labels || [])],
        }),
      }
    );

    if (!response.ok) {
      // The server rejected the request. Release this reservation even if the
      // error body is missing or malformed, so corrected settings can retry.
      await db.integrationSync.deleteMany({ where: { id: reservation.id, status: 'pending' } });
      const error = await response.json().catch(() => null);
      console.error('GitHub API error:', response.status, typeof error?.message === 'string' ? error.message : 'No error message');
      return null;
    }

    const issue = await response.json();
    if (!Number.isSafeInteger(issue.number) || issue.number < 1) return null;
    const issueUrl = `https://github.com/${repository}/issues/${issue.number}`;

    await db.integrationSync.update({
      where: { id: reservation.id, status: 'pending' },
      data: {
        externalId: String(issue.number),
        externalUrl: issueUrl,
        status: 'synced',
      },
    });

    return { issueNumber: issue.number, issueUrl };
  } catch (error) {
    console.error('GitHub issue creation error:', error);
    return null;
  }
}
