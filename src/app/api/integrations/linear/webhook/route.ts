import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();

    if (body.type === 'Issue' && body.action === 'update') {
      const stateType = body.data?.state?.type;

      if (stateType === 'completed' || stateType === 'done') {
        const identifier = body.data?.identifier;
        if (!identifier) return NextResponse.json({ received: true });

        const sync = await db.integrationSync.findFirst({
          where: { externalId: identifier, entityType: 'post' },
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
                  lastLinearAction: 'completed',
                  completedAt: new Date().toISOString(),
                },
              },
            });
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Linear webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
