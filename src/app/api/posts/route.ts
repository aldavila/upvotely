import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createPostSchema } from '@/lib/validators';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get('boardId');
    const status = searchParams.get('status');
    const sort = searchParams.get('sort') || 'votes';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!boardId) {
      return NextResponse.json(
        { error: 'Board ID is required' },
        { status: 400 }
      );
    }

    // Build where clause
    const where: any = {
      boardId,
      isApproved: true,
      mergedIntoId: null, // Don't show merged posts
    };

    if (status) {
      where.status = { slug: status };
    }

    // Build orderBy
    let orderBy: any;
    switch (sort) {
      case 'newest':
        orderBy = { createdAt: 'desc' };
        break;
      case 'trending':
        // For trending, we'd ideally use a computed score
        // For now, use recent + votes
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
    console.error('Error fetching posts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = await req.json();
    const validatedData = createPostSchema.parse(body);

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
        { error: 'No default status configured' },
        { status: 500 }
      );
    }

    // Create post
    const post = await db.post.create({
      data: {
        title: validatedData.title,
        content: validatedData.content,
        boardId: validatedData.boardId,
        authorId: validatedData.isAnonymous ? null : session?.user?.id,
        statusId: defaultStatus.id,
        isAnonymous: validatedData.isAnonymous,
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
      await db.vote.create({
        data: {
          postId: post.id,
          userId: session.user.id,
        },
      });

      // Update vote count
      await db.post.update({
        where: { id: post.id },
        data: { voteCount: 1 },
      });
    }

    return NextResponse.json(post, { status: 201 });
  } catch (error) {
    console.error('Error creating post:', error);
    
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
