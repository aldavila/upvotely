import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/posts/sentiment-stats
 * Returns aggregated sentiment data for the organization's posts.
 * Session auth only (dashboard feature).
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

    const orgId = membership.organizationId;

    // Count by sentiment
    const [positive, neutral, negative, total] = await Promise.all([
      db.post.count({
        where: { board: { organizationId: orgId }, sentiment: 'positive' },
      }),
      db.post.count({
        where: { board: { organizationId: orgId }, sentiment: 'neutral' },
      }),
      db.post.count({
        where: { board: { organizationId: orgId }, sentiment: 'negative' },
      }),
      db.post.count({
        where: { board: { organizationId: orgId }, sentiment: { not: null } },
      }),
    ]);

    // Average sentiment score
    const avgResult = await db.post.aggregate({
      where: {
        board: { organizationId: orgId },
        sentimentScore: { not: null },
      },
      _avg: { sentimentScore: true },
    });

    // Sentiment over time (last 12 weeks)
    const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000);
    const recentPosts = await db.post.findMany({
      where: {
        board: { organizationId: orgId },
        sentiment: { not: null },
        createdAt: { gte: twelveWeeksAgo },
      },
      select: { sentiment: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    // Group by week
    const weeklyMap = new Map<string, { positive: number; neutral: number; negative: number }>();
    for (const post of recentPosts) {
      const weekStart = new Date(post.createdAt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const key = weekStart.toISOString().slice(0, 10);

      if (!weeklyMap.has(key)) {
        weeklyMap.set(key, { positive: 0, neutral: 0, negative: 0 });
      }
      const week = weeklyMap.get(key)!;
      if (post.sentiment === 'positive') week.positive++;
      else if (post.sentiment === 'neutral') week.neutral++;
      else if (post.sentiment === 'negative') week.negative++;
    }

    const weekly = Array.from(weeklyMap.entries()).map(([week, counts]) => ({
      week,
      ...counts,
      total: counts.positive + counts.neutral + counts.negative,
    }));

    return NextResponse.json({
      data: {
        distribution: { positive, neutral, negative, total },
        averageScore: avgResult._avg.sentimentScore ?? 0,
        weekly,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching sentiment stats:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch sentiment stats' },
      { status: 500 }
    );
  }
}
