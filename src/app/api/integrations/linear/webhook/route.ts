import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isFreshLinearTimestamp, linearSyncWhere, organizationPostWhere, verifyLinearSignature } from '@/lib/linear-security';
import type { Prisma } from '@prisma/client';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    if (!verifyLinearSignature(rawBody, req.headers.get('Linear-Signature'), process.env.LINEAR_WEBHOOK_SIGNING_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = JSON.parse(rawBody);
    if (!isFreshLinearTimestamp(body?.webhookTimestamp, Date.now())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (body.type === 'Issue' && body.action === 'update') {
      const stateType = body.data?.state?.type;

      if (stateType === 'completed' || stateType === 'done') {
        const issueId = body.data?.id;
        const teamId = body.data?.teamId ?? body.data?.team?.id;
        if (typeof issueId !== 'string' || !issueId || typeof teamId !== 'string' || !teamId) {
          return NextResponse.json({ received: true });
        }

        const syncs = await db.integrationSync.findMany({
          where: linearSyncWhere(issueId, teamId),
          include: {
            integration: {
              include: { organization: { include: { statuses: true } } },
            },
          },
        });

        for (const sync of syncs) {
          const completeStatus = sync.integration.organization.statuses.find(
            (s) => s.type === 'complete'
          );

          if (completeStatus) {
            const updated = await db.post.updateMany({
              where: organizationPostWhere(sync.entityId, sync.integration.organizationId),
              data: { statusId: completeStatus.id },
            });
            if (!updated.count) continue;

            await db.integrationSync.update({
              where: { id: sync.id },
              data: {
                metadata: {
                  ...(sync.metadata as Prisma.JsonObject || {}),
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
