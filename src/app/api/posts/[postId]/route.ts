import { after, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emitWebhook } from '@/lib/webhooks/emit';
import { z } from 'zod';
import { notifyStatusChange } from '@/lib/notifications/events';
import { isOrganizationAdmin } from '@/lib/status-notification-policy';

const updateStatusSchema = z.object({ statusId: z.string().cuid() }).strict();

// Status changes require the same owner/admin role as other admin routes.
export async function PATCH(req: Request, { params }: { params: Promise<{ postId: string }> }): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { postId } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const parsed = updateStatusSchema.safeParse(body);
    if (!z.string().cuid().safeParse(postId).success || !parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }
    const post = await db.post.findUnique({
      where: { id: postId },
      include: { board: true, status: true },
    });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    const organizationId = post.board.organizationId;
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, organizationId, role: { in: ['owner', 'admin'] } },
    });
    if (!isOrganizationAdmin(membership, organizationId)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const status = await db.status.findFirst({
      where: { id: parsed.data.statusId, organizationId },
    });
    if (!status) {
      return NextResponse.json({ error: 'Status not found' }, { status: 404 });
    }
    if (post.statusId !== status.id) {
      // Only the request that actually changes this status emits an event.
      const updated = await db.post.updateMany({
        where: { id: post.id, statusId: post.statusId },
        data: { statusId: status.id },
      });
      if (!updated.count) {
        return NextResponse.json({ error: 'Post status changed; retry' }, { status: 409 });
      }
      emitWebhook(organizationId, 'post.updated', { ...post, statusId: status.id });
      emitWebhook(organizationId, 'post.status_changed', {
        postId: post.id, oldStatusId: post.statusId, newStatusId: status.id,
      });
      const actorId = session.user.id;
      after(() => notifyStatusChange(post, post.status, status, organizationId, actorId).catch(console.error));
    }
    return NextResponse.json({ id: post.id, statusId: status.id });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error changing post status:', error);
    }
    return NextResponse.json({ error: 'Failed to change post status' }, { status: 500 });
  }
}
