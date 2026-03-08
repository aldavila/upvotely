import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { generateWebhookSecret } from '@/lib/webhooks';

const webhookConfigSchema = z.object({
  webhookUrl: z.string().url().optional().or(z.literal('')),
  webhookEvents: z.array(z.string()).optional(),
  regenerateSecret: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const org = await db.organization.findUnique({
      where: { id: membership.organizationId },
      select: { webhookUrl: true, webhookSecret: true, webhookEvents: true },
    });

    return NextResponse.json({
      webhookUrl: org?.webhookUrl || '',
      webhookEvents: org?.webhookEvents || [],
      hasSecret: !!org?.webhookSecret,
      secretPreview: org?.webhookSecret ? `${org.webhookSecret.slice(0, 10)}...` : null,
    });
  } catch (error) {
    console.error('Get webhook config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parseResult = webhookConfigSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (parseResult.data.webhookUrl !== undefined) updateData.webhookUrl = parseResult.data.webhookUrl || null;
    if (parseResult.data.webhookEvents !== undefined) updateData.webhookEvents = parseResult.data.webhookEvents;
    if (parseResult.data.regenerateSecret) updateData.webhookSecret = generateWebhookSecret();

    const org = await db.organization.update({
      where: { id: membership.organizationId },
      data: updateData,
      select: { webhookUrl: true, webhookSecret: true, webhookEvents: true },
    });

    return NextResponse.json({
      webhookUrl: org.webhookUrl || '',
      webhookEvents: org.webhookEvents,
      hasSecret: !!org.webhookSecret,
      secretPreview: org.webhookSecret ? `${org.webhookSecret.slice(0, 10)}...` : null,
    });
  } catch (error) {
    console.error('Update webhook config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
