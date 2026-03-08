import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const event = req.headers.get('x-github-event');
    const body = await req.json();

    if (event === 'issues' && body.action === 'closed') {
      const issueNumber = String(body.issue.number);

      const sync = await db.integrationSync.findFirst({
        where: { externalId: issueNumber, entityType: 'post' },
        include: {
          integration: {
            include: { organization: { include: { statuses: true } } },
          },
        },
      });

      if (sync) {
        const completeStatus = sync.integration.organization.statuses.find(
          (s) => s.type === 'complete'
        );

        if (completeStatus) {
          await db.post.update({
            where: { id: sync.entityId },
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
