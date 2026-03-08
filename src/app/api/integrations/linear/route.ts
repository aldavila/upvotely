import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const linearConfigSchema = z.object({
  apiKey: z.string().min(1),
  teamId: z.string().min(1),
});

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const integration = await db.integration.findUnique({
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'linear' } },
    });

    return NextResponse.json({
      integration: integration ? { ...integration, config: { ...(integration.config as Record<string, unknown>), apiKey: undefined } } : null,
    });
  } catch (error) {
    console.error('Get Linear integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parseResult = linearConfigSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 });
    }

    const integration = await db.integration.upsert({
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'linear' } },
      create: { organizationId: membership.organizationId, type: 'linear', config: parseResult.data, isActive: true },
      update: { config: parseResult.data, isActive: true },
    });

    return NextResponse.json({ integration }, { status: 201 });
  } catch (error) {
    console.error('Save Linear integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    await db.integration.deleteMany({ where: { organizationId: membership.organizationId, type: 'linear' } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete Linear integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
