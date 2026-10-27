import { db } from '@/lib/db';
import { createBulkNotifications, createNotification } from './index';

export async function notifyNewPost(post: { id: string; title: string }, organizationId: string, actorId?: string | null) {
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  await createBulkNotifications(
    members.map(member => member.userId).filter(userId => userId !== actorId),
    organizationId, 'new_post', 'New feedback', post.title,
    '/dashboard/boards', { postId: post.id },
  );
}

export async function notifyNewComment(
  post: { id: string; title: string; authorId: string | null },
  comment: { id: string; authorId: string; content: string; isInternal: boolean },
  organizationId: string,
) {
  if (!post.authorId || post.authorId === comment.authorId) return;
  // Internal comment content must only reach members of this post's organization.
  if (comment.isInternal) {
    const membership = await db.organizationMember.findFirst({
      where: { userId: post.authorId, organizationId },
    });
    if (!membership) return;
  }
  await createNotification({
    userId: post.authorId, organizationId, type: 'new_comment',
    title: `New comment on ${post.title}`, message: comment.content,
    link: '/dashboard/boards', metadata: { postId: post.id, commentId: comment.id },
  });
}
