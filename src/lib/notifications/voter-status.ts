import { db } from '@/lib/db';
import { buildStatusChangeEmail, statusNotificationChannels } from '@/lib/status-notification-policy';

export async function notifyVotersOnStatusChange(
  postId: string,
  organizationId: string,
  oldStatusName: string,
  newStatusName: string
) {
  const votes = await db.vote.findMany({
    where: { postId },
    select: { userId: true },
  });

  const post = await db.post.findUnique({
    where: { id: postId },
    select: { title: true, boardId: true },
  });

  if (!post || votes.length === 0) return { notified: 0 };

  const subscriptions = await db.postSubscription.findMany({
    where: { postId, isSubscribed: false },
    select: { userId: true },
  });
  const unsubscribedUserIds = new Set(subscriptions.map((s) => s.userId));

  const eligibleUserIds = votes
    .map((v) => v.userId)
    .filter((id) => !unsubscribedUserIds.has(id));

  if (eligibleUserIds.length === 0) return { notified: 0 };

  const recipients = await Promise.all(eligibleUserIds.map(async (userId) => {
    const preference = await db.notificationPreference.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
    });
    return { userId, ...statusNotificationChannels(preference) };
  }));

  const notifications = recipients.filter((recipient) => recipient.inApp).map(({ userId }) => ({
    userId,
    organizationId,
    type: 'status_change',
    title: `Status Update: ${post.title}`,
    message: `Your feature request "${post.title}" is now ${newStatusName}`,
    link: `/dashboard/boards/${post.boardId}/posts/${postId}`,
    metadata: { postId, oldStatus: oldStatusName, newStatus: newStatusName },
  }));

  const deliveries = await Promise.allSettled([
    ...(notifications.length ? [db.notification.createMany({ data: notifications })] : []),
    sendVoterStatusEmails(recipients.filter((recipient) => recipient.email).map(({ userId }) => userId), post.title, newStatusName, postId),
  ]);
  for (const delivery of deliveries) {
    if (delivery.status === 'rejected') console.error('Voter notification delivery failed');
  }

  return { notified: eligibleUserIds.length };
}

async function sendVoterStatusEmails(
  userIds: string[],
  postTitle: string,
  newStatus: string,
  postId: string
) {
  const users = await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, email: true },
  });

  const emailProvider = process.env.EMAIL_PROVIDER;
  const apiKey = emailProvider === 'resend'
    ? process.env.RESEND_API_KEY
    : process.env.SENDGRID_API_KEY;

  if (!apiKey) return;

  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) throw new Error('UNSUBSCRIBE_TOKEN_SECRET is required');

  const appUrl = process.env.NEXTAUTH_URL || 'https://app.upvotely.io';

  const deliveries = await Promise.allSettled(users.map(async (user) => {
    if (!user.email) return;

    const html = buildStatusChangeEmail(postTitle, newStatus, postId, user.id, appUrl, secret);
    const emailFrom = process.env.EMAIL_FROM || 'Upvotely <notifications@upvotely.io>';

    if (emailProvider === 'resend') {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'manual',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: emailFrom, to: user.email, subject: `Status Update: ${postTitle}`, html }),
      });
      if (!response.ok) throw new Error('Email delivery failed');
    } else if (emailProvider === 'sendgrid') {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        redirect: 'manual',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: user.email }] }],
          from: { email: process.env.EMAIL_FROM || 'notifications@upvotely.io' },
          subject: `Status Update: ${postTitle}`,
          content: [{ type: 'text/html', value: html }],
        }),
      });
      if (!response.ok) throw new Error('Email delivery failed');
    }
  }));
  for (const delivery of deliveries) {
    if (delivery.status === 'rejected') console.error('Voter status email delivery failed');
  }
}
