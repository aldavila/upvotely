import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const githubConfigSchema = z.object({
  accessToken: z.string().min(1),
  owner: z.string().min(1),
  repo: z.string().min(1),
  defaultLabels: z.array(z.string()).optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const integration = await db.integration.findUnique({
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'github' } },
    });

    return NextResponse.json({ integration: integration ? { ...integration, config: { ...(integration.config as Record<string, unknown>), accessToken: undefined } } : null });
  } catch (error) {
    console.error('Get GitHub integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = githubConfigSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 });
    }

    const integration = await db.integration.upsert({
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'github' } },
      create: { organizationId: membership.organizationId, type: 'github', config: parseResult.data, isActive: true },
      update: { config: parseResult.data, isActive: true },
    });

    return NextResponse.json({ integration }, { status: 201 });
  } catch (error) {
    console.error('Save GitHub integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.integration.deleteMany({ where: { organizationId: membership.organizationId, type: 'github' } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete GitHub integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
