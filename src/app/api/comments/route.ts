import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCommentSchema } from '@/lib/validators';
import { z } from 'zod';

const getCommentsQuerySchema = z.object({
  postId: z.string().cuid(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const session = await auth();

    const queryResult = getCommentsQuerySchema.safeParse({
      postId: searchParams.get('postId'),
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '50',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { postId, page, limit } = queryResult.data;

    // Check if user is a team member (to see internal comments)
    let isTeamMember = false;
    if (session?.user?.id) {
      const post = await db.post.findUnique({
        where: { id: postId },
        select: { board: { select: { organizationId: true } } },
      });

      if (post) {
        const membership = await db.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId: session.user.id,
              organizationId: post.board.organizationId,
            },
          },
        });
        isTeamMember = !!membership;
      }
    }

    const where: any = { postId, parentId: null };
    if (!isTeamMember) {
      where.isInternal = false;
    }

    const [comments, total] = await Promise.all([
      db.comment.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, image: true } },
          replies: {
            where: isTeamMember ? {} : { isInternal: false },
            include: {
              author: { select: { id: true, name: true, image: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.comment.count({ where }),
    ]);

    return NextResponse.json({
      comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      isTeamMember,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createCommentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const { content, postId, parentId, isInternal } = parseResult.data;

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { board: { select: { organizationId: true } } },
    });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // If internal comment, verify user is team member
    if (isInternal) {
      const membership = await db.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: session.user.id,
            organizationId: post.board.organizationId,
          },
        },
      });
      if (!membership) {
        return NextResponse.json(
          { error: 'Only team members can post internal comments' },
          { status: 403 }
        );
      }
    }

    if (parentId) {
      const parent = await db.comment.findUnique({ where: { id: parentId } });
      if (!parent || parent.postId !== postId) {
        return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 });
      }
    }

    const comment = await db.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: session.user.id,
        parentId: parentId || null,
        isInternal: isInternal ?? false,
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating comment:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}
