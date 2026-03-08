import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const updateSuggestionSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['accepted', 'dismissed']),
});

/**
 * GET /api/posts/merge-suggestions?boardId=...
 * List pending merge suggestions for a board. Admin only.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
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

    const { searchParams } = new URL(req.url);
    const boardId = searchParams.get('boardId');
    const status = searchParams.get('status') || 'pending';

    const where: Record<string, unknown> = {
      status,
      sourcePost: {
        board: { organizationId: membership.organizationId },
        ...(boardId ? { boardId } : {}),
      },
    };

    const suggestions = await db.mergeSuggestion.findMany({
      where,
      include: {
        sourcePost: {
          select: {
            id: true,
            title: true,
            voteCount: true,
            createdAt: true,
            status: { select: { name: true, color: true } },
            board: { select: { name: true } },
          },
        },
        targetPost: {
          select: {
            id: true,
            title: true,
            voteCount: true,
            createdAt: true,
            status: { select: { name: true, color: true } },
          },
        },
      },
      orderBy: { similarity: 'desc' },
      take: 50,
    });

    return NextResponse.json({ data: suggestions });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching merge suggestions:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch merge suggestions' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/posts/merge-suggestions
 * Accept or dismiss a merge suggestion. Admin only.
 */
export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ['owner', 'admin'] },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = updateSuggestionSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { id, status } = parseResult.data;

    const suggestion = await db.mergeSuggestion.findUnique({
      where: { id },
      include: {
        sourcePost: {
          select: { board: { select: { organizationId: true } } },
        },
      },
    });

    if (!suggestion || suggestion.sourcePost.board.organizationId !== membership.organizationId) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    const updated = await db.mergeSuggestion.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error updating merge suggestion:', error);
    }
    return NextResponse.json(
      { error: 'Failed to update merge suggestion' },
      { status: 500 }
    );
  }
}
