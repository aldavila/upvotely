import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { githubPostWhere, githubRepository, githubSyncWhere, verifyGitHubSignature } from '@/lib/github-security';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    if (!verifyGitHubSignature(rawBody, req.headers.get('x-hub-signature-256'), process.env.GITHUB_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const event = req.headers.get('x-github-event');
    const body = JSON.parse(rawBody);

    if (event === 'issues' && body.action === 'closed') {
      const issueNumber = body.issue?.number;
      const fullName = body.repository?.full_name;
      const parts = typeof fullName === 'string' ? fullName.split('/') : [];
      const repository = parts.length === 2 ? githubRepository(parts[0], parts[1]) : null;
      if (!repository || !Number.isSafeInteger(issueNumber) || issueNumber < 1) {
        return NextResponse.json({ error: 'Invalid issue event' }, { status: 400 });
      }

      const integrations = await db.integration.findMany({
        where: { type: 'github', isActive: true },
        include: { organization: { include: { statuses: true } } },
      });

      for (const integration of integrations) {
        const config = integration.config as { owner?: string; repo?: string } | null;
        if (githubRepository(config?.owner, config?.repo) !== repository) continue;
        const syncs = await db.integrationSync.findMany({
          where: githubSyncWhere(integration.id, repository, issueNumber),
        });
        const completeStatus = integration.organization.statuses.find(
          (s) => s.type === 'complete'
        );

        if (!completeStatus) continue;
        for (const sync of syncs) {
          // Reject any cross-organization mappings left by earlier exports.
          const post = await db.post.findUnique({
            where: githubPostWhere(sync.entityId, integration.organizationId),
          });
          if (!post) continue;
          await db.post.update({
            where: githubPostWhere(sync.entityId, integration.organizationId),
            data: { statusId: completeStatus.id },
          });

          await db.integrationSync.update({
            where: { id: sync.id },
            data: {
              metadata: {
                ...(sync.metadata as Record<string, unknown> || {}),
                lastGitHubAction: 'closed',
                closedAt: new Date().toISOString(),
              },
            },
          });
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('GitHub webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
