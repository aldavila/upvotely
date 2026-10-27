import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const eventType = searchParams.get('event');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where = {
      organizationId: membership.organizationId,
      ...(status ? { status } : {}),
      ...(eventType ? { event: eventType } : {}),
    };

    const [events, total] = await Promise.all([
      db.webhookEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.webhookEvent.count({ where }),
    ]);

    return NextResponse.json({ events, total, page, limit });
  } catch (error) {
    console.error('Get webhook events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
