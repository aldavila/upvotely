import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
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

    const orgId = membership.organizationId;

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
    const since = new Date();
    since.setDate(since.getDate() - days);

    const baseWhere = {
      organizationId: orgId,
      createdAt: { gte: since },
    };

    // Get overall counts
    const [totalCount, positiveCount, negativeCount] = await Promise.all([
      db.conversationFeedback.count({ where: baseWhere }),
      db.conversationFeedback.count({ where: { ...baseWhere, rating: 'positive' } }),
      db.conversationFeedback.count({ where: { ...baseWhere, rating: 'negative' } }),
    ]);

    const satisfactionRate = totalCount > 0
      ? Math.round((positiveCount / totalCount) * 100)
      : 0;

    // Get per-agent stats
    const agentStats = await db.conversationFeedback.groupBy({
      by: ['agentId', 'agentName', 'rating'],
      where: baseWhere,
      _count: true,
    });

    // Aggregate per-agent
    const agentMap = new Map<string, {
      agentId: string;
      agentName: string | null;
      positive: number;
      negative: number;
      total: number;
    }>();

    for (const row of agentStats) {
      const key = row.agentId ?? 'unknown';
      const existing = agentMap.get(key) ?? {
        agentId: key,
        agentName: row.agentName,
        positive: 0,
        negative: 0,
        total: 0,
      };

      if (row.rating === 'positive') {
        existing.positive += row._count;
      } else {
        existing.negative += row._count;
      }
      existing.total += row._count;
      agentMap.set(key, existing);
    }

    const agents = Array.from(agentMap.values())
      .map((a) => ({
        ...a,
        satisfactionRate: a.total > 0 ? Math.round((a.positive / a.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Get negative feedback tags (for themes)
    const negativeFeedback = await db.conversationFeedback.findMany({
      where: { ...baseWhere, rating: 'negative' },
      select: { tags: true, comment: true },
    });

    const tagCounts = new Map<string, number>();
    for (const fb of negativeFeedback) {
      for (const tag of fb.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    const negativeThemes = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get daily trend data
    const allFeedback = await db.conversationFeedback.findMany({
      where: baseWhere,
      select: { createdAt: true, rating: true },
      orderBy: { createdAt: 'asc' },
    });

    const dailyMap = new Map<string, { positive: number; negative: number }>();
    for (const fb of allFeedback) {
      const day = fb.createdAt.toISOString().slice(0, 10);
      const existing = dailyMap.get(day) ?? { positive: 0, negative: 0 };
      if (fb.rating === 'positive') existing.positive++;
      else existing.negative++;
      dailyMap.set(day, existing);
    }

    const dailyTrend = Array.from(dailyMap.entries())
      .map(([date, counts]) => ({
        date,
        ...counts,
        total: counts.positive + counts.negative,
        rate: counts.positive + counts.negative > 0
          ? Math.round((counts.positive / (counts.positive + counts.negative)) * 100)
          : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({
      period,
      overview: {
        total: totalCount,
        positive: positiveCount,
        negative: negativeCount,
        satisfactionRate,
      },
      agents,
      negativeThemes,
      dailyTrend,
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
