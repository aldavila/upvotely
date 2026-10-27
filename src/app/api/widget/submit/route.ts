import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';
import { notifyPostCreated } from '@/lib/integrations/slack';

// Validation schema for widget submissions
const widgetSubmitSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title too long').trim(),
  content: z.string().min(10, 'Content must be at least 10 characters').max(10000, 'Content too long').trim(),
  boardId: z.string().cuid().optional(),
  organizationSlug: z.string().min(1).max(50).optional(),
  boardSlug: z.string().min(1).max(50).optional(),
}).refine(
  (data) => data.boardId || (data.organizationSlug && data.boardSlug),
  { message: 'Either boardId or both organizationSlug and boardSlug are required' }
);

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await req.json();
    
    const parseResult = widgetSubmitSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 }
      );
    }

    const { title, content, boardId, organizationSlug, boardSlug } = parseResult.data;

    // Find the board
    let board;

    if (boardId) {
      board = await db.board.findUnique({
        where: { id: boardId },
        select: {
          id: true, organizationId: true, isPublic: true, requireApproval: true,
          name: true, slug: true, organization: { select: { slug: true } },
        },
      });
    } else if (organizationSlug && boardSlug) {
      const organization = await db.organization.findUnique({
        where: { slug: organizationSlug },
        select: { id: true },
      });

      if (organization) {
        board = await db.board.findUnique({
          where: {
            organizationId_slug: {
              organizationId: organization.id,
              slug: boardSlug,
            },
          },
          select: {
            id: true, organizationId: true, isPublic: true, requireApproval: true,
            name: true, slug: true, organization: { select: { slug: true } },
          },
        });
      }
    }

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    if (!board.isPublic) {
      return NextResponse.json({ error: 'Board is not public' }, { status: 403 });
    }

    // Get default status
    const defaultStatus = await db.status.findFirst({
      where: {
        organizationId: board.organizationId,
        isDefault: true,
      },
      select: { id: true },
    });

    if (!defaultStatus) {
      return NextResponse.json(
        { error: 'Board configuration error' },
        { status: 500 }
      );
    }

    // Create the post
    const post = await db.post.create({
      data: {
        title,
        content,
        boardId: board.id,
        statusId: defaultStatus.id,
        isAnonymous: true,
        isApproved: !board.requireApproval,
      },
      select: { id: true, isApproved: true },
    });

    if (post.isApproved) {
      notifyPostCreated(board.organizationId, {
        title, content, boardName: board.name,
        authorName: null, organizationSlug: board.organization.slug, boardSlug: board.slug,
      }).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      postId: post.id,
      approved: post.isApproved,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Widget submit error:', error);
    }
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
