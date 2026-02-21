import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createBoardSchema } from '@/lib/validators';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!membership) {
      return NextResponse.json({ error: 'No organization' }, { status: 404 });
    }

    const boards = await db.board.findMany({
      where: {
        organizationId: membership.organizationId,
        isArchived: false,
      },
      include: {
        _count: { select: { posts: true } },
        tags: true,
      },
      orderBy: { position: 'asc' },
    });

    return NextResponse.json(boards);
  } catch (error) {
    console.error('Error fetching boards:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validatedData = createBoardSchema.parse(body);

    // Check if slug is unique within org
    const existingBoard = await db.board.findUnique({
      where: {
        organizationId_slug: {
          organizationId: membership.organizationId,
          slug: validatedData.slug,
        },
      },
    });

    if (existingBoard) {
      return NextResponse.json(
        { error: 'A board with this slug already exists' },
        { status: 400 }
      );
    }

    // Get default status
    let defaultStatus = await db.status.findFirst({
      where: {
        organizationId: membership.organizationId,
        isDefault: true,
      },
    });

    // Create default statuses if none exist
    if (!defaultStatus) {
      const statuses = [
        { name: 'Open', slug: 'open', type: 'open', color: '#6b7280', isDefault: true, position: 0 },
        { name: 'Under Review', slug: 'under_review', type: 'under_review', color: '#f59e0b', position: 1 },
        { name: 'Planned', slug: 'planned', type: 'planned', color: '#3b82f6', showOnRoadmap: true, position: 2 },
        { name: 'In Progress', slug: 'in_progress', type: 'in_progress', color: '#8b5cf6', showOnRoadmap: true, position: 3 },
        { name: 'Complete', slug: 'complete', type: 'complete', color: '#10b981', showOnRoadmap: true, position: 4 },
        { name: 'Closed', slug: 'closed', type: 'closed', color: '#ef4444', position: 5 },
      ];

      await db.status.createMany({
        data: statuses.map((s) => ({
          ...s,
          organizationId: membership.organizationId,
        })),
      });

      defaultStatus = await db.status.findFirst({
        where: {
          organizationId: membership.organizationId,
          isDefault: true,
        },
      });
    }

    // Get max position
    const maxPosition = await db.board.aggregate({
      where: { organizationId: membership.organizationId },
      _max: { position: true },
    });

    const board = await db.board.create({
      data: {
        ...validatedData,
        organizationId: membership.organizationId,
        position: (maxPosition._max.position ?? -1) + 1,
      },
    });

    // Update org board count
    await db.organization.update({
      where: { id: membership.organizationId },
      data: { boardsCount: { increment: 1 } },
    });

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    console.error('Error creating board:', error);
    
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
