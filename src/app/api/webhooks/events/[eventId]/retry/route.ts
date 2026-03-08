import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { deliverWithRetry } from '@/lib/webhooks';

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

    const org = await db.organization.findUnique({
      where: { id: membership.organizationId },
      select: { webhookUrl: true, webhookSecret: true },
    });

    if (!org?.webhookUrl) return NextResponse.json({ error: 'No webhook URL configured' }, { status: 400 });

    await db.webhookEvent.update({
      where: { id: eventId },
      data: { status: 'pending', attempts: 0 },
    });

    deliverWithRetry(
      eventId,
      org.webhookUrl,
      org.webhookSecret,
      webhookEvent.payload as { event: string; timestamp: string; data: Record<string, unknown> }
    ).catch(console.error);

    return NextResponse.json({ success: true, message: 'Retry scheduled' });
  } catch (error) {
    console.error('Retry webhook error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
