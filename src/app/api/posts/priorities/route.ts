import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

const prioritiesQuerySchema = z.object({
  boardId: z.string().cuid().optional(),
  sort: z.enum(['priority_score', 'mrr', 'votes']).default('mrr'),
  status: z.string().optional(),
  minMrr: z.coerce.number().min(0).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

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
    const queryResult = prioritiesQuerySchema.safeParse({
      boardId: searchParams.get('boardId') || undefined,
      sort: searchParams.get('sort') || 'mrr',
      status: searchParams.get('status') || undefined,
      minMrr: searchParams.get('minMrr') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { boardId, sort, status, minMrr, page, limit } = queryResult.data;
    const orgId = membership.organizationId;

    const where: Prisma.PostWhereInput = {
      board: { organizationId: orgId },
      mergedIntoId: null,
      isApproved: true,
    };

    if (boardId) where.boardId = boardId;
    if (status) where.status = { slug: status };
    if (minMrr !== undefined) where.totalRequestingMrr = { gte: minMrr };

    let orderBy: Prisma.PostOrderByWithRelationInput[];
    switch (sort) {
      case 'priority_score':
        orderBy = [{ priorityScore: { sort: 'desc', nulls: 'last' } }, { voteCount: 'desc' }];
        break;
      case 'votes':
        orderBy = [{ voteCount: 'desc' }];
        break;
      case 'mrr':
      default:
        orderBy = [{ totalRequestingMrr: { sort: 'desc', nulls: 'last' } }, { voteCount: 'desc' }];
    }

    const [posts, total] = await Promise.all([
      db.post.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, image: true } },
          status: true,
          board: true,
          tags: true,
          _count: { select: { votes: true, comments: true } },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.post.count({ where }),
    ]);

    return NextResponse.json({
      posts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching priorities:', error);
    return NextResponse.json({ error: 'Failed to fetch priorities' }, { status: 500 });
  }
}
