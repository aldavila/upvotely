import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const searchQuerySchema = z.object({
  boardId: z.string().cuid(),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * GET /api/posts/search?boardId=...&q=...&limit=...
 * Text-based search for similar posts within a board.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const queryResult = searchQuerySchema.safeParse({
      boardId: searchParams.get('boardId'),
      q: searchParams.get('q'),
      limit: searchParams.get('limit') || '10',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { boardId, q, limit } = queryResult.data;

    // Text-based search using Prisma contains (case-insensitive)
    const posts = await db.post.findMany({
      where: {
        boardId,
        isApproved: true,
        mergedIntoId: null,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
        status: true,
        tags: true,
        _count: { select: { votes: true, comments: true } },
      },
      orderBy: { voteCount: 'desc' },
      take: limit,
    });

    return NextResponse.json({ posts, query: q });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error searching posts:', error);
    }
    return NextResponse.json(
      { error: 'Failed to search posts' },
      { status: 500 }
    );
  }
}
