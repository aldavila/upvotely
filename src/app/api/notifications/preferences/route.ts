import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { preferencesSchema, effectiveEmailFrequency } from '@/lib/notifications/preferences';

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });
    if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 404 });

    const preferences = await db.notificationPreference.findUnique({
      where: { userId_organizationId: { userId: session.user.id, organizationId: membership.organizationId } },
    });

    return NextResponse.json({ preferences: preferences && { ...preferences, emailDigest: effectiveEmailFrequency(preferences.emailDigest) } });
  } catch (error) {
    console.error('Get notification preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });
    if (!membership) return NextResponse.json({ error: 'No organization' }, { status: 404 });

    const body = await req.json();
    const parseResult = preferencesSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input. Email frequency must be instant or none; digests are unavailable.', details: parseResult.error.issues }, { status: 400 });
    }

    const preferences = await db.notificationPreference.upsert({
      where: { userId_organizationId: { userId: session.user.id, organizationId: membership.organizationId } },
      create: { userId: session.user.id, organizationId: membership.organizationId, ...parseResult.data },
      update: parseResult.data,
    });

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error('Update notification preferences error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
