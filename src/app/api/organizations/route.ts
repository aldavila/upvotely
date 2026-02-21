import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createOrganizationSchema } from '@/lib/validators';
import { z } from 'zod';

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberships = await db.organizationMember.findMany({
      where: { userId: session.user.id },
      include: {
        organization: {
          include: {
            _count: { select: { boards: true, members: true } },
          },
        },
      },
    });

    return NextResponse.json(
      memberships.map((m) => ({
        ...m.organization,
        role: m.role,
      }))
    );
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching organizations:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
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

    const userId = session.user.id;
    const body = await req.json();
    
    const parseResult = createOrganizationSchema.safeParse(body);
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

    // Check if slug is available
    const existingOrg = await db.organization.findUnique({
      where: { slug: sanitizedSlug },
    });

    if (existingOrg) {
      return NextResponse.json(
        { error: 'This URL is already taken' },
        { status: 400 }
      );
    }

    // Create organization and membership in a transaction
    const organization = await db.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: sanitizedName,
          slug: sanitizedSlug,
          description: validatedData.description?.trim(),
        },
      });

      // Add creator as owner
      await tx.organizationMember.create({
        data: {
          userId,
          organizationId: org.id,
          role: 'owner',
        },
      });

      // Create default statuses
      await tx.status.createMany({
        data: [
          { organizationId: org.id, name: 'Open', slug: 'open', type: 'open', color: '#6b7280', isDefault: true, position: 0 },
          { organizationId: org.id, name: 'Under Review', slug: 'under_review', type: 'under_review', color: '#f59e0b', position: 1 },
          { organizationId: org.id, name: 'Planned', slug: 'planned', type: 'planned', color: '#3b82f6', showOnRoadmap: true, position: 2 },
          { organizationId: org.id, name: 'In Progress', slug: 'in_progress', type: 'in_progress', color: '#8b5cf6', showOnRoadmap: true, position: 3 },
          { organizationId: org.id, name: 'Complete', slug: 'complete', type: 'complete', color: '#10b981', showOnRoadmap: true, position: 4 },
          { organizationId: org.id, name: 'Closed', slug: 'closed', type: 'closed', color: '#ef4444', position: 5 },
        ],
      });

      return org;
    });

    return NextResponse.json(organization, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating organization:', error);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    );
  }
}
