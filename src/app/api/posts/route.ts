import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { createPostSchema } from '@/lib/validators';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { categorizeAndUpdatePost } from '@/lib/ai/categorize';
import { analyzeAndUpdateSentiment } from '@/lib/ai/sentiment';
import { createMergeSuggestions } from '@/lib/ai/similarity';

// Query params validation schema
const getPostsQuerySchema = z.object({
  boardId: z.string().cuid(),
  status: z.string().optional(),
  aiCategory: z.string().optional(),
  sentiment: z.string().optional(),
  sort: z.enum(['votes', 'newest', 'trending']).default('votes'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const queryResult = getPostsQuerySchema.safeParse({
      boardId: searchParams.get('boardId'),
      status: searchParams.get('status') || undefined,
      aiCategory: searchParams.get('aiCategory') || undefined,
      sentiment: searchParams.get('sentiment') || undefined,
      sort: searchParams.get('sort') || 'votes',
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { boardId, status, aiCategory, sentiment, sort, page, limit } = queryResult.data;

    // Dual auth: try API key first, then session
    const apiKeyResult = await authenticateApiKey(req, 'read');
    if (apiKeyResult) {
      // Verify board belongs to the API key's org
      const board = await db.board.findUnique({
        where: { id: boardId },
        select: { organizationId: true },
      });

      if (!board || board.organizationId !== apiKeyResult.organizationId) {
        return NextResponse.json({ error: 'Board not found' }, { status: 404 });
      }
    }
    // No API key — public endpoint for reading posts (existing behavior)

    // Build where clause with proper typing
    const where: Prisma.PostWhereInput = {
      boardId,
      isApproved: true,
      mergedIntoId: null, // Don't show merged posts
    };

    if (status) {
      where.status = { slug: status };
    }

    if (aiCategory) {
      where.aiCategory = aiCategory;
    }

    if (sentiment) {
      where.sentiment = sentiment;
    }

    // Build orderBy with proper typing
    let orderBy: Prisma.PostOrderByWithRelationInput | Prisma.PostOrderByWithRelationInput[];
    switch (sort) {
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'trending':
        // For trending, use recent + votes
        orderBy = [{ voteCount: 'desc' }, { createdAt: 'desc' }];
        break;
      case 'votes':
      default:
        orderBy = { voteCount: 'desc' };
    }

    const [posts, total] = await Promise.all([
      db.post.findMany({
        where,
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
          status: true,
          tags: true,
          _count: {
            select: { votes: true, comments: true },
          },
        },
        orderBy,
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
      console.error('Error fetching posts:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Dual auth: try API key first, then session
    let userId: string | null = null;
    let orgId: string | null = null;

    const apiKeyResult = await authenticateApiKey(req, 'write');
    if (apiKeyResult) {
      orgId = apiKeyResult.organizationId;
    } else {
      const session = await auth();
      if (session?.user?.id) {
        userId = session.user.id;
      }
    }

    const body = await req.json();

    const parseResult = createPostSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const validatedData = parseResult.data;

    // Get the board and verify access
    const board = await db.board.findUnique({
      where: { id: validatedData.boardId },
      include: { organization: true },
    });

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // If using API key, verify board belongs to the org
    if (orgId && board.organizationId !== orgId) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    // Check if anonymous posting is allowed or user is authenticated
    if (!board.allowAnonymous && !userId && !orgId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get default status
    const defaultStatus = await db.status.findFirst({
      where: {
        organizationId: board.organizationId,
        isDefault: true,
      },
    });

    if (!defaultStatus) {
      return NextResponse.json(
        { error: 'Board configuration error' },
        { status: 500 }
      );
    }

    // Sanitize input
    const sanitizedTitle = validatedData.title.trim();
    const sanitizedContent = validatedData.content.trim();

    // Create post with auto-upvote in a transaction to prevent race conditions
    const result = await db.$transaction(async (tx) => {
      const post = await tx.post.create({
        data: {
          title: sanitizedTitle,
          content: sanitizedContent,
          boardId: validatedData.boardId,
          authorId: (validatedData.isAnonymous || !userId) ? null : userId,
          statusId: defaultStatus.id,
          isAnonymous: validatedData.isAnonymous ?? (!userId),
          isApproved: !board.requireApproval,
          tags: validatedData.tagIds
            ? { connect: validatedData.tagIds.map((id) => ({ id })) }
            : undefined,
        },
        include: {
          author: {
            select: { id: true, name: true, image: true },
          },
          status: true,
          tags: true,
          _count: {
            select: { votes: true, comments: true },
          },
        },
      });

      // Auto-upvote by author if not anonymous and has userId
      if (userId && !validatedData.isAnonymous) {
        await tx.vote.create({
          data: {
            postId: post.id,
            userId,
          },
        });

        // Update vote count atomically
        await tx.post.update({
          where: { id: post.id },
          data: { voteCount: 1 },
        });
      }

      return post;
    });

    // Fire-and-forget: AI categorization, sentiment analysis, and duplicate detection
    categorizeAndUpdatePost(result.id, sanitizedTitle, sanitizedContent).catch(() => {});
    analyzeAndUpdateSentiment(result.id, sanitizedTitle, sanitizedContent).catch(() => {});
    createMergeSuggestions(result.id, sanitizedTitle, sanitizedContent, validatedData.boardId).catch(() => {});

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating post:', error);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create post' },
      { status: 500 }
    );
  }
}
