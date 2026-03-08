import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { computeFeedbackStats } from '@/lib/feedback-stats';
import { z } from 'zod';

const statsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});

/**
 * GET /api/feedback/stats
 * Returns aggregated conversation feedback stats for the dashboard.
 * Session-authenticated only (dashboard use).
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const queryResult = statsQuerySchema.safeParse({
      period: searchParams.get('period') || '30d',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { period } = queryResult.data;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;

    const stats = await computeFeedbackStats(membership.organizationId, days);

    return NextResponse.json({
      period,
      ...stats,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching feedback stats:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch feedback stats' },
      { status: 500 }
    );
  }
}
