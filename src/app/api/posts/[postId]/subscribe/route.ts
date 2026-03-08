import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  try {
    const { postId } = await params;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const subscription = await db.postSubscription.findUnique({
      where: { postId_userId: { postId, userId: session.user.id } },
    });

    return NextResponse.json({ isSubscribed: subscription?.isSubscribed ?? true });
  } catch (error) {
    console.error('Get subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  try {
    const { postId } = await params;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const existing = await db.postSubscription.findUnique({
      where: { postId_userId: { postId, userId: session.user.id } },
    });

    const newState = existing ? !existing.isSubscribed : false;

    const subscription = await db.postSubscription.upsert({
      where: { postId_userId: { postId, userId: session.user.id } },
      create: { postId, userId: session.user.id, isSubscribed: newState },
      update: { isSubscribed: newState },
    });

    return NextResponse.json({ isSubscribed: subscription.isSubscribed });
  } catch (error) {
    console.error('Toggle subscription error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
