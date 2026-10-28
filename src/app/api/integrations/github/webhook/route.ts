import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emitWebhook } from '@/lib/webhooks/emit';
import { githubPostWhere, githubRepository, githubSyncWhere, verifyGitHubSignature } from '@/lib/github-security';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const fullName = body?.repository?.full_name;
    const parts = typeof fullName === 'string' ? fullName.split('/') : [];
    const repository = parts.length === 2 ? githubRepository(parts[0], parts[1]) : null;
    if (!repository) {
      return NextResponse.json({ error: 'Invalid repository' }, { status: 400 });
    }
    const integrations = await db.integration.findMany({
      where: { type: 'github', isActive: true, config: { path: ['repository'], equals: repository } },
      include: { organization: { include: { statuses: true } } },
    });
    // A repository may be connected to multiple organizations. Each matching
    // integration must authenticate independently, even for the same repository.
    const authenticated = integrations.filter((integration) => {
      const config = integration.config as { owner?: string; repo?: string; webhookSecret?: string } | null;
      return githubRepository(config?.owner, config?.repo) === repository &&
        verifyGitHubSignature(rawBody, req.headers.get('x-hub-signature-256'), config?.webhookSecret);
    });
    if (!authenticated.length) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (req.headers.get('x-github-event') === 'issues' && body.action === 'closed') {
      const issueNumber = body.issue?.number;
      if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
        return NextResponse.json({ error: 'Invalid issue event' }, { status: 400 });
      }
      for (const integration of authenticated) {
        const syncs = await db.integrationSync.findMany({
          where: githubSyncWhere(integration.id, repository, issueNumber),
        });
        const completeStatus = integration.organization.statuses.find(
          (s) => s.type === 'complete'
        );

        if (!completeStatus) continue;
        for (const sync of syncs) {
          // Reject any cross-organization mappings left by earlier exports.
          const post = await db.post.findFirst({
            where: githubPostWhere(sync.entityId, integration.organizationId),
            select: { id: true, statusId: true },
          });
          if (!post || post.statusId === completeStatus.id) continue;
          const oldStatusId = post.statusId;
          const updated = await db.post.updateMany({
            where: { ...githubPostWhere(sync.entityId, integration.organizationId), statusId: oldStatusId },
            data: { statusId: completeStatus.id },
          });
          if (!updated.count) continue;
          emitWebhook(integration.organizationId, 'post.status_changed', {
            postId: post.id, oldStatusId, newStatusId: completeStatus.id,
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
  } catch {
    console.error('GitHub webhook error');
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
