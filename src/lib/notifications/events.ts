import { db } from '@/lib/db';
import { createBulkNotifications, createNotification } from './index';

export async function notifyNewPost(post: { id: string; title: string; authorId: string | null; isAnonymous?: boolean }, organizationId: string, actorId?: string | null) {
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true },
  });
  await createBulkNotifications(
    members.map(member => member.userId).filter(userId => userId !== actorId),
    organizationId, 'new_post', 'New feedback', post.title,
    '/dashboard/boards', { postId: post.id },
    // Anonymous submissions (including widgets) cannot trigger instant email fan-out.
    { skipEmail: post.isAnonymous || !post.authorId },
  );
}

export async function notifyNewComment(
  post: { id: string; title: string; authorId: string | null },
  comment: { id: string; authorId: string; content: string; isInternal: boolean },
  organizationId: string,
  mentionedUserIds: string[] = [],
) {
  // A mentioned post author receives only the mention for this comment.
  if (!post.authorId || post.authorId === comment.authorId || mentionedUserIds.includes(post.authorId)) return;
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

export async function notifyStatusChange(
  post: { id: string; title: string; authorId: string | null; boardId: string },
  oldStatus: { id: string; name: string },
  newStatus: { id: string; name: string },
  organizationId: string,
  actorId?: string,
) {
  if (oldStatus.id === newStatus.id) return;
  // Vote.userId and Post.authorId reference real User accounts, not widget visitors/customers.
  const votes = await db.vote.findMany({ where: { postId: post.id }, select: { userId: true } });
  const subscriptions = await db.postSubscription.findMany({
    where: { postId: post.id, isSubscribed: false }, select: { userId: true },
  });
  const unsubscribed = new Set(subscriptions.map(subscription => subscription.userId));
  const recipients = [...new Set([post.authorId, ...votes.map(vote => vote.userId)])]
    .filter((userId): userId is string => !!userId && userId !== actorId && !unsubscribed.has(userId));
  const members = await db.organizationMember.findMany({
    where: { organizationId, userId: { in: recipients } },
    select: { userId: true },
  });
  const memberIds = new Set(members.map(member => member.userId));
  for (const userId of recipients) {
    await createNotification({
      userId, organizationId, type: 'status_change', title: `Status changed on ${post.title}`,
      message: `${oldStatus.name} → ${newStatus.name}`, link: `/dashboard/boards/${post.boardId}/posts/${post.id}`,
      metadata: { postId: post.id, oldStatusId: oldStatus.id, newStatusId: newStatus.id },
    }, {
      // Public voters receive the signed per-post unsubscribe email through the same
      // preference-driven delivery path, so member/voter overlap cannot duplicate sends.
      statusEmail: memberIds.has(userId) ? undefined
        : { postId: post.id, postTitle: post.title, newStatus: newStatus.name },
    });
  }
  return { notified: recipients.length };
}

export async function notifyMentions(
  post: { id: string; title: string },
  comment: { id: string; authorId: string; content: string; isInternal: boolean },
  organizationId: string,
) {
  // Match @email-local-part or @exact-single-token-name, case-insensitively.
  // Tokens contain ASCII letters/digits/underscores, optionally separated by . + or -.
  const mentions = new Set(Array.from(
    comment.content.matchAll(/(?:^|[^\w@])@([a-z0-9_]+(?:[.+-][a-z0-9_]+)*)(?![\w@])/gi),
    match => match[1].toLowerCase(),
  ));
  if (!mentions.size) return [];
  // Resolve through membership for public AND internal comments; outsiders never receive mentions.
  const members = await db.organizationMember.findMany({
    where: { organizationId },
    select: { userId: true, user: { select: { name: true, email: true } } },
    orderBy: { userId: 'asc' },
  });
  const recipients = [...new Set(members.filter(member => member.userId !== comment.authorId && (
    mentions.has(member.user.email.split('@')[0].toLowerCase()) ||
    (member.user.name && mentions.has(member.user.name.toLowerCase()))
  )).map(member => member.userId))].slice(0, 10);
  await createBulkNotifications(
    recipients, organizationId, 'mention', `You were mentioned on ${post.title}`,
    comment.content, '/dashboard/boards', { postId: post.id, commentId: comment.id },
  );
  return recipients;
}
