import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCommentSchema } from '@/lib/validators';
import { z } from 'zod';

const getCommentsQuerySchema = z.object({
  postId: z.string().cuid(),
  includeInternal: z.enum(['true', 'false']).default('false'),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);

    const queryResult = getCommentsQuerySchema.safeParse({
      postId: searchParams.get('postId'),
      includeInternal: searchParams.get('includeInternal') || 'false',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { postId, includeInternal } = queryResult.data;

    // Check if user is a team member (required to see internal comments)
    let isTeamMember = false;
    if (session?.user?.id) {
      const post = await db.post.findUnique({
        where: { id: postId },
        include: { board: true },
      });

      if (post) {
        const membership = await db.organizationMember.findFirst({
          where: {
            userId: session.user.id,
            organizationId: post.board.organizationId,
          },
        });
        isTeamMember = !!membership;
      }
    }

    const showInternal = includeInternal === 'true' && isTeamMember;

    const comments = await db.comment.findMany({
      where: {
        postId,
        parentId: null, // Top-level comments only
        ...(showInternal ? {} : { isInternal: false }),
      },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
        replies: {
          where: showInternal ? {} : { isInternal: false },
          include: {
            author: {
              select: { id: true, name: true, image: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ comments, isTeamMember });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching comments:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
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
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { content, postId, parentId, isInternal } = parseResult.data;

    // Verify the post exists
    const post = await db.post.findUnique({
      where: { id: postId },
      include: { board: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // If internal comment, verify user is a team member
    if (isInternal) {
      const membership = await db.organizationMember.findFirst({
        where: {
          userId: session.user.id,
          organizationId: post.board.organizationId,
        },
      });

      if (!membership) {
        return NextResponse.json(
          { error: 'Only team members can post internal comments' },
          { status: 403 }
        );
      }
    }

    const comment = await db.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId: session.user.id,
        parentId: parentId ?? null,
        isInternal: isInternal ?? false,
      },
      include: {
        author: {
          select: { id: true, name: true, image: true },
        },
      },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating comment:', error);
    }
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
