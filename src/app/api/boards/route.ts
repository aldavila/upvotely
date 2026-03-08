import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { createBoardSchema } from '@/lib/validators';
import { z } from 'zod';

export async function GET(req: Request): Promise<NextResponse> {
  try {
    let orgId: string;

    // Dual auth: try API key first, then session
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

    const boards = await db.board.findMany({
      where: {
        organizationId: orgId,
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
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching boards:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch boards' },
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
    const parseResult = createBoardSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const validatedData = parseResult.data;

    // Sanitize inputs
    const sanitizedSlug = validatedData.slug.toLowerCase().trim();
    const sanitizedName = validatedData.name.trim();

    // Check if slug is unique within org
    const existingBoard = await db.board.findUnique({
      where: {
        organizationId_slug: {
          organizationId: membership.organizationId,
          slug: sanitizedSlug,
        },
      },
    });

    if (existingBoard) {
      return NextResponse.json(
        { error: 'A board with this slug already exists' },
        { status: 400 }
      );
    }

    // Use transaction for atomicity
    const board = await db.$transaction(async (tx) => {
      // Get default status
      let defaultStatus = await tx.status.findFirst({
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

        await tx.status.createMany({
          data: statuses.map((s) => ({
            ...s,
            organizationId: membership.organizationId,
          })),
        });

        defaultStatus = await tx.status.findFirst({
          where: {
            organizationId: membership.organizationId,
            isDefault: true,
          },
        });
      }

      // Get max position
      const maxPosition = await tx.board.aggregate({
        where: { organizationId: membership.organizationId },
        _max: { position: true },
      });

      const newBoard = await tx.board.create({
        data: {
          name: sanitizedName,
          slug: sanitizedSlug,
          description: validatedData.description?.trim(),
          isPublic: validatedData.isPublic ?? true,
          allowAnonymous: validatedData.allowAnonymous ?? false,
          requireApproval: validatedData.requireApproval ?? false,
          organizationId: membership.organizationId,
          position: (maxPosition._max.position ?? -1) + 1,
        },
      });

      // Update org board count
      await tx.organization.update({
        where: { id: membership.organizationId },
        data: { boardsCount: { increment: 1 } },
      });

      return newBoard;
    });

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating board:', error);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create board' },
      { status: 500 }
    );
  }
}
