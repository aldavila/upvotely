import { db } from '@/lib/db';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export async function getLinearConfig(organizationId: string) {
  const integration = await db.integration.findUnique({
    where: { organizationId_type: { organizationId, type: 'linear' } },
  });
  if (!integration?.isActive) return null;
  return {
    integration,
    config: integration.config as { apiKey: string; teamId: string },
  };
}

export async function createLinearIssue(
  organizationId: string,
  postId: string,
  data: { title: string; description: string }
): Promise<{ issueId: string; issueIdentifier: string; issueUrl: string } | null> {
  const result = await getLinearConfig(organizationId);
  if (!result) return null;

  const { integration, config } = result;

  try {
    return await db.$transaction(async (tx) => {
      // Serialize first exports as well as retries across server instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${integration.id}), hashtext(${postId}))`;
      const mappingKey = {
        integrationId_entityType_entityId: {
          integrationId: integration.id,
          entityType: 'post',
          entityId: postId,
        },
      };
      const existing = await tx.integrationSync.findUnique({ where: mappingKey });
      if (existing) {
        const metadata = existing.metadata as { linearIssueId?: unknown } | null;
        if (typeof metadata?.linearIssueId !== 'string' || !existing.externalUrl) return null;
        return {
          issueId: metadata.linearIssueId,
          issueIdentifier: existing.externalId,
          issueUrl: existing.externalUrl,
        };
      }

      const response = await fetch(LINEAR_API_URL, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: config.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `mutation IssueCreate($input: IssueCreateInput!) {
            issueCreate(input: $input) {
              success
              issue {
                id
                identifier
                url
                title
              }
            }
          }`,
          variables: {
            input: {
              teamId: config.teamId,
              title: data.title,
              description: `${data.description}\n\n---\n*Created from Upvotely feedback*`,
            },
          },
        }),
      });

      if (!response.ok) {
        console.error('Linear API error:', await response.text());
        return null;
      }

      const json = await response.json();
      const issue = json.data?.issueCreate?.issue;

      if (!issue) {
        console.error('Linear issue creation failed:', json);
        return null;
      }

      await tx.integrationSync.upsert({
        where: mappingKey,
        create: {
          integrationId: integration.id,
          entityType: 'post',
          entityId: postId,
          externalId: issue.identifier,
          externalUrl: issue.url,
          direction: 'outbound',
          metadata: { linearIssueId: issue.id },
        },
        update: {
          externalId: issue.identifier,
          externalUrl: issue.url,
          metadata: { linearIssueId: issue.id },
        },
      });

      return {
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        issueUrl: issue.url,
      };
    }, { timeout: 30_000 });
  } catch (error) {
    console.error('Linear issue creation error:', error);
    return null;
  }
}
