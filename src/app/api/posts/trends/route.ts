import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const trendsQuerySchema = z.object({
  period: z.enum(['7d', '30d', '90d']).default('30d'),
});

/**
 * GET /api/posts/trends?period=30d
 * Returns trending data: velocities, top voted, most discussed, status distribution, volume.
 * Session auth only.
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
    const queryResult = trendsQuerySchema.safeParse({
      period: searchParams.get('period') || '30d',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { period } = queryResult.data;
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const orgFilter = { board: { organizationId: orgId } };

    // Run all queries in parallel
    const [
      newPostsCount,
      newVotesCount,
      topVoted,
      mostDiscussed,
      statusCounts,
      postsForVolume,
      boardActivity,
    ] = await Promise.all([
      // New posts this period
      db.post.count({
        where: { ...orgFilter, createdAt: { gte: since } },
      }),
      // New votes this period
      db.vote.count({
        where: { post: orgFilter, createdAt: { gte: since } },
      }),
      // Top voted posts (most votes this period)
      db.post.findMany({
        where: { ...orgFilter, isApproved: true, mergedIntoId: null },
        include: {
          status: { select: { name: true, color: true, slug: true } },
          board: { select: { name: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { voteCount: 'desc' },
        take: 10,
      }),
      // Most discussed (most comments this period)
      db.post.findMany({
        where: {
          ...orgFilter,
          isApproved: true,
          mergedIntoId: null,
          comments: { some: { createdAt: { gte: since } } },
        },
        include: {
          status: { select: { name: true, color: true, slug: true } },
          board: { select: { name: true } },
          _count: { select: { comments: true } },
        },
        orderBy: { comments: { _count: 'desc' } },
        take: 10,
      }),
      // Status distribution
      db.post.groupBy({
        by: ['statusId'],
        where: orgFilter,
        _count: true,
      }),
      // Posts for volume chart (created dates)
      db.post.findMany({
        where: { ...orgFilter, createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      // Most active board
      db.board.findMany({
        where: { organizationId: orgId, isArchived: false },
        select: {
          name: true,
          _count: {
            select: {
              posts: { where: { createdAt: { gte: since } } },
            },
          },
        },
        orderBy: { posts: { _count: 'desc' } },
        take: 1,
      }),
    ]);

    // Resolve status names for distribution
    const statusIds = statusCounts.map((s) => s.statusId);
    const statuses = await db.status.findMany({
      where: { id: { in: statusIds } },
      select: { id: true, name: true, color: true },
    });
    const statusMap = new Map(statuses.map((s) => [s.id, s]));

    const statusDistribution = statusCounts.map((sc) => ({
      statusId: sc.statusId,
      name: statusMap.get(sc.statusId)?.name ?? 'Unknown',
      color: statusMap.get(sc.statusId)?.color ?? '#6b7280',
      count: sc._count,
    })).sort((a, b) => b.count - a.count);

    // Build daily volume
    const dailyVolume = new Map<string, number>();
    for (const post of postsForVolume) {
      const day = post.createdAt.toISOString().slice(0, 10);
      dailyVolume.set(day, (dailyVolume.get(day) || 0) + 1);
    }

    const feedbackVolume = Array.from(dailyVolume.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    return NextResponse.json({
      data: {
        period,
        days,
        newPosts: newPostsCount,
        newVotes: newVotesCount,
        avgPostsPerDay: Math.round((newPostsCount / days) * 10) / 10,
        mostActiveBoard: boardActivity[0]?.name ?? null,
        topVoted: topVoted.map((p) => ({
          id: p.id,
          title: p.title,
          voteCount: p.voteCount,
          commentCount: p._count.comments,
          status: p.status,
          board: p.board.name,
        })),
        mostDiscussed: mostDiscussed.map((p) => ({
          id: p.id,
          title: p.title,
          voteCount: p.voteCount,
          commentCount: p._count.comments,
          status: p.status,
          board: p.board.name,
        })),
        statusDistribution,
        feedbackVolume,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching trends:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch trends' },
      { status: 500 }
    );
  }
}
