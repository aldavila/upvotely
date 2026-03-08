import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  try {
    const { postId } = await params;
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return new NextResponse('<html><body><h1>Invalid unsubscribe link</h1></body></html>', {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    await db.postSubscription.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId, isSubscribed: false },
      update: { isSubscribed: false },
    });

    return new NextResponse(
      `<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 50px auto; text-align: center;">
  <h2 style="color: #7c3aed;">Upvotely</h2>
  <p>You have been unsubscribed from updates for this post.</p>
  <p style="color: #9ca3af; font-size: 14px;">You will no longer receive notifications when this post's status changes.</p>
</body>
</html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return new NextResponse('<html><body><h1>Something went wrong</h1></body></html>', {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}
