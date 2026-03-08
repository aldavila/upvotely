import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { notifyVotersOnStatusChange } from '@/lib/notifications/voter-status';

const updateStatusSchema = z.object({
  statusId: z.string().cuid(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  try {
    const { postId } = await params;
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
    const parseResult = updateStatusSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 });
    }

    const post = await db.post.findUnique({
      where: { id: postId },
      include: { status: true, board: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const newStatus = await db.status.findUnique({
      where: { id: parseResult.data.statusId },
    });

    if (!newStatus) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 });
    }

    const oldStatusName = post.status.name;

    const updatedPost = await db.post.update({
      where: { id: postId },
      data: { statusId: parseResult.data.statusId },
      include: { status: true },
    });

    // Notify voters in the background
    notifyVotersOnStatusChange(
      postId,
      membership.organizationId,
      oldStatusName,
      newStatus.name
    ).catch(console.error);

    return NextResponse.json({ post: updatedPost });
  } catch (error) {
    console.error('Update post status error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
