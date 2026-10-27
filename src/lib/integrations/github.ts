import { db } from '@/lib/db';
import { githubRepository } from '../github-security';

interface GitHubIssueData {
  title: string;
  body: string;
  labels?: string[];
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
  data: GitHubIssueData
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
      if (existing.status !== 'synced' || !existing.externalUrl || !existing.externalId) return null;
      return { issueNumber: Number(existing.externalId), issueUrl: existing.externalUrl };
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
      console.error('GitHub API error:', response.status);
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
