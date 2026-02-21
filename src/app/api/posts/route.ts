import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createPostSchema } from '@/lib/validators';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';

// Query params validation schema
const getPostsQuerySchema = z.object({
  boardId: z.string().cuid(),
  status: z.string().optional(),
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

    const { boardId, status, sort, page, limit } = queryResult.data;

    // Build where clause with proper typing
    const where: Prisma.PostWhereInput = {
      boardId,
      isApproved: true,
      mergedIntoId: null, // Don't show merged posts
    };

    if (status) {
      where.status = { slug: status };
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
    const session = await auth();
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

    // Check if anonymous posting is allowed or user is authenticated
    if (!board.allowAnonymous && !session?.user?.id) {
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
          authorId: validatedData.isAnonymous ? null : session?.user?.id,
          statusId: defaultStatus.id,
          isAnonymous: validatedData.isAnonymous ?? false,
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

      // Auto-upvote by author if not anonymous
      if (session?.user?.id && !validatedData.isAnonymous) {
        await tx.vote.create({
          data: {
            postId: post.id,
            userId: session.user.id,
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
