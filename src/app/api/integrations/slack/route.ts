import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { hashSlackConnectionCode, isSlackWebhookUrl } from '@/lib/slack-security';

const publicIntegrationSelect = { config: true, isActive: true, slackTeamId: true };

const slackConfigSchema = z.object({
  webhookUrl: z.string().refine(isSlackWebhookUrl, 'Use an HTTPS hooks.slack.com URL'),
  channel: z.string().optional(),
  notifyOnNewPost: z.boolean().default(true),
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
      select: publicIntegrationSelect,
    });

    return NextResponse.json({ integration });
  } catch {
    console.error('Get Slack integration failed');
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

    const connectionCode = randomBytes(32).toString('hex');
    const connection = {
      slackConnectionCodeHash: hashSlackConnectionCode(connectionCode),
      slackConnectionExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    const integration = await db.integration.upsert({
      where: { organizationId_type: { organizationId: membership.organizationId, type: 'slack' } },
      select: publicIntegrationSelect,
      create: {
        ...connection,
        organizationId: membership.organizationId,
        type: 'slack',
        config: parseResult.data,
        isActive: true,
      },
      update: {
        ...connection,
        config: parseResult.data,
        isActive: true,
      },
    });

    return NextResponse.json({ integration, connectionCode: integration.slackTeamId ? undefined : connectionCode }, { status: 201 });
  } catch {
    // Database errors can contain the webhook URL or connection hash.
    console.error('Save Slack integration failed');
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
  } catch {
    console.error('Delete Slack integration failed');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
