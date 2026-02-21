import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createOrganizationSchema } from '@/lib/validators';

export async function GET() {
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
    console.error('Error fetching organizations:', error);
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

    const body = await req.json();
    const validatedData = createOrganizationSchema.parse(body);

    // Check if slug is available
    const existingOrg = await db.organization.findUnique({
      where: { slug: validatedData.slug },
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
          name: validatedData.name,
          slug: validatedData.slug,
          description: validatedData.description,
        },
      });

      // Add creator as owner
      await tx.organizationMember.create({
        data: {
          userId: session.user!.id!,
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
    console.error('Error creating organization:', error);

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
