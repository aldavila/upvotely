import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { z } from 'zod';

const searchQuerySchema = z.object({
  boardId: z.string().cuid(),
  q: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  mode: z.enum(['full', 'autocomplete', 'suggestions']).default('full'),
});

/**
 * GET /api/posts/search?boardId=...&q=...&limit=...&mode=...
 * Text-based search for posts within a board.
 *
 * Modes:
 * - full: complete post data (requires auth)
 * - autocomplete: lightweight for live search (id, title, voteCount) — public
 * - suggestions: compact for submit dialog (id, title, voteCount, status) — public
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const queryResult = searchQuerySchema.safeParse({
      boardId: searchParams.get('boardId'),
      q: searchParams.get('q'),
      limit: searchParams.get('limit') || (searchParams.get('mode') === 'autocomplete' ? '8' : searchParams.get('mode') === 'suggestions' ? '5' : '10'),
      mode: searchParams.get('mode') || 'full',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { boardId, q, limit, mode } = queryResult.data;

    // For full mode, require auth. For autocomplete/suggestions, allow public access.
    if (mode === 'full') {
      let orgId: string | null = null;

      const apiKeyResult = await authenticateApiKey(req, 'read');
      if (apiKeyResult) {
        orgId = apiKeyResult.organizationId;
      } else {
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

        orgId = membership.organizationId;
      }

      const board = await db.board.findUnique({
        where: { id: boardId },
        select: { organizationId: true },
      });

      if (!board || board.organizationId !== orgId) {
        return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      }
    }

    const whereClause = {
      boardId,
      isApproved: true,
      mergedIntoId: null,
      OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { content: { contains: q, mode: 'insensitive' as const } },
      ],
    };

    if (mode === 'autocomplete') {
      const posts = await db.post.findMany({
        where: whereClause,
        select: { id: true, title: true, voteCount: true },
        orderBy: { voteCount: 'desc' },
        take: limit,
      });
      return NextResponse.json({ data: posts, query: q });
    }

    if (mode === 'suggestions') {
      const posts = await db.post.findMany({
        where: whereClause,
        select: {
          id: true,
          title: true,
          voteCount: true,
          status: { select: { name: true, color: true, slug: true } },
        },
        orderBy: { voteCount: 'desc' },
        take: limit,
      });
      return NextResponse.json({ data: posts, query: q });
    }

    // Full mode
    const posts = await db.post.findMany({
      where: whereClause,
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
