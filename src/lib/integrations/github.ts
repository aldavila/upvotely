import { db } from '@/lib/db';

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

  try {
    const response = await fetch(
      `https://api.github.com/repos/${config.owner}/${config.repo}/issues`,
      {
        method: 'POST',
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
      console.error('GitHub API error:', await response.text());
      return null;
    }

    const issue = await response.json();

    await db.integrationSync.upsert({
      where: {
        integrationId_entityType_entityId: {
          integrationId: integration.id,
          entityType: 'post',
          entityId: postId,
        },
      },
      create: {
        integrationId: integration.id,
        entityType: 'post',
        entityId: postId,
        externalId: String(issue.number),
        externalUrl: issue.html_url,
        direction: 'outbound',
      },
      update: {
        externalId: String(issue.number),
        externalUrl: issue.html_url,
      },
    });

    return { issueNumber: issue.number, issueUrl: issue.html_url };
  } catch (error) {
    console.error('GitHub issue creation error:', error);
    return null;
  }
}
