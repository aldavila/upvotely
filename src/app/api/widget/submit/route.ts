import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, content, boardId, organizationSlug, boardSlug } = body;

    if (!title || !content) {
      return NextResponse.json(
        { error: 'Title and content are required' },
        { status: 400 }
      );
    }

    // Find the board
    let board;

    if (boardId) {
      board = await db.board.findUnique({
        where: { id: boardId },
        include: { organization: true },
      });
    } else if (organizationSlug && boardSlug) {
      const organization = await db.organization.findUnique({
        where: { slug: organizationSlug },
      });

      if (organization) {
        board = await db.board.findUnique({
          where: {
            organizationId_slug: {
              organizationId: organization.id,
              slug: boardSlug,
            },
          },
          include: { organization: true },
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
    });

    if (!defaultStatus) {
      return NextResponse.json(
        { error: 'No default status configured' },
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
    });

    return NextResponse.json({
      success: true,
      postId: post.id,
      approved: post.isApproved,
    });
  } catch (error) {
    console.error('Widget submit error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
