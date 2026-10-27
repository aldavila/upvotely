import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isFreshLinearTimestamp, linearSyncWhere, organizationPostWhere, verifyLinearSignature } from '@/lib/linear-security';
import type { Prisma } from '@prisma/client';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('Linear-Signature');
    if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isFreshLinearTimestamp(body?.webhookTimestamp, Date.now())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // The untrusted team ID only selects candidates; each integration must
    // authenticate the raw body with its own webhook signing secret.
    const teamId = body.data?.teamId ?? body.data?.team?.id;
    if (typeof teamId !== 'string' || !teamId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const candidates = await db.integration.findMany({
      where: { type: 'linear', isActive: true, config: { path: ['teamId'], equals: teamId } },
      select: { id: true, config: true },
    });
    const integrationIds = candidates.filter((integration) => {
      const secret = (integration.config as Prisma.JsonObject | null)?.webhookSecret;
      return typeof secret === 'string' && verifyLinearSignature(rawBody, signature, secret);
    }).map((integration) => integration.id);
    if (!integrationIds.length) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (body.type === 'Issue' && body.action === 'update') {
      const stateType = body.data?.state?.type;

      if (stateType === 'completed' || stateType === 'done') {
        const issueId = body.data?.id;
        if (typeof issueId !== 'string' || !issueId) {
          return NextResponse.json({ received: true });
        }

        const syncs = await db.integrationSync.findMany({
          where: { ...linearSyncWhere(issueId, teamId), integrationId: { in: integrationIds } },
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
