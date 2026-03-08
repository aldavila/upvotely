import { NextResponse } from 'next/server';
import { authenticateApiKey } from '@/lib/api-auth';
import { db } from '@/lib/db';
import { findSimilarPosts } from '@/lib/ai/similarity';
import { z } from 'zod';

const similarQuerySchema = z.object({
  boardId: z.string().cuid(),
  title: z.string().min(1).max(500),
  content: z.string().max(10000).optional(),
  excludePostId: z.string().cuid().optional(),
});

/**
 * GET /api/posts/similar?boardId=...&title=...&content=...
 * Find similar posts using keyword-based similarity.
 * Public endpoint (no auth required) for use in submit dialog.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const queryResult = similarQuerySchema.safeParse({
      boardId: searchParams.get('boardId'),
      title: searchParams.get('title'),
      content: searchParams.get('content') || undefined,
      excludePostId: searchParams.get('excludePostId') || undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { boardId, title, content, excludePostId } = queryResult.data;

    // Verify board exists
    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { id: true },
    });

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    const similar = await findSimilarPosts(
      title,
      content || '',
      boardId,
      excludePostId,
      5,
      0.2
    );

    return NextResponse.json({ data: similar });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error finding similar posts:', error);
    }
    return NextResponse.json(
      { error: 'Failed to find similar posts' },
      { status: 500 }
    );
  }
}
