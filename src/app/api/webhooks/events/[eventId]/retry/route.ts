import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { deliverWithRetry } from '@/lib/webhooks';
import { isWebhookPayload } from '@/lib/webhook-payload';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ eventId: string }> }
): Promise<NextResponse> {
  try {
    const { eventId } = await params;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const webhookEvent = await db.webhookEvent.findFirst({
      where: { id: eventId, organizationId: membership.organizationId },
    });

    if (!webhookEvent) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    if (!isWebhookPayload(webhookEvent.payload)) {
      return NextResponse.json({ error: 'Invalid event payload' }, { status: 400 });
    }

    const org = await db.organization.findUnique({
      where: { id: membership.organizationId },
      select: { webhookUrl: true, webhookSecret: true },
    });

    if (!org?.webhookUrl) return NextResponse.json({ error: 'No webhook URL configured' }, { status: 400 });

    const claimed = await db.webhookEvent.updateMany({
      where: { id: eventId, organizationId: membership.organizationId, status: 'failed' },
      data: { status: 'pending', attempts: 0 },
    });
    if (claimed.count !== 1) return NextResponse.json({ error: 'Event is not failed' }, { status: 409 });

    await deliverWithRetry(
      eventId,
      org.webhookUrl,
      org.webhookSecret,
      webhookEvent.payload
    );

    return NextResponse.json({ success: true, message: 'Retry completed' });
  } catch (error) {
    console.error('Retry webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
