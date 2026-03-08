import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const slackConfigSchema = z.object({
  webhookUrl: z.string().url(),
  channel: z.string().optional(),
  teamId: z.string().optional(),
  notifyOnNewPost: z.boolean().default(true),
  notifyOnStatusChange: z.boolean().default(true),
  notifyOnVoteMilestone: z.boolean().default(true),
  voteMilestones: z.array(z.number()).default([10, 25, 50, 100]),
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
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'slack' } },
    });

    return NextResponse.json({ integration });
  } catch (error) {
    console.error('Get Slack integration error:', error);
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
    const parseResult = slackConfigSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const integration = await db.integration.upsert({
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'slack' } },
      create: {
        organizationId: membership.organizationId,
        type: 'slack',
        config: parseResult.data,
        isActive: true,
      },
      update: {
        config: parseResult.data,
        isActive: true,
      },
    });

    return NextResponse.json({ integration }, { status: 201 });
  } catch (error) {
    console.error('Save Slack integration error:', error);
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

    await db.integration.deleteMany({
      where: { organizationId: membership.organizationId, type: 'slack' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete Slack integration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
