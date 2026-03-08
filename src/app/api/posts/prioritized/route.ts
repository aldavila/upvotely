import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const querySchema = z.object({
  boardId: z.string().cuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * GET /api/posts/prioritized
 * Returns posts sorted by revenue-weighted priority score.
 * Requires dashboard auth (session-based).
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's organization
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const queryResult = querySchema.safeParse({
      boardId: searchParams.get('boardId') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { boardId, page, limit } = queryResult.data;

    const where = {
      board: { organizationId: membership.organizationId },
      isApproved: true,
      mergedIntoId: null,
      ...(boardId ? { boardId } : {}),
    };

    const [posts, total] = await Promise.all([
      db.post.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, image: true } },
          status: true,
          board: { select: { id: true, name: true, slug: true } },
          tags: true,
          _count: {
            select: { votes: true, comments: true, customerRequests: true },
          },
        },
        orderBy: [
          { priorityScore: 'desc' },
          { totalRequestingMrr: 'desc' },
          { voteCount: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.post.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching prioritized posts:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch prioritized posts' },
      { status: 500 }
    );
  }
}
