import { db } from '@/lib/db';

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

  const notifications = eligibleUserIds.map((userId) => ({
    userId,
    organizationId,
    type: 'status_change',
    title: `Status Update: ${post.title}`,
    message: `Your feature request "${post.title}" is now ${newStatusName}`,
    link: `/dashboard/boards/${post.boardId}/posts/${postId}`,
    metadata: { postId, oldStatus: oldStatusName, newStatus: newStatusName },
  }));

  await db.notification.createMany({ data: notifications });

  sendVoterStatusEmails(eligibleUserIds, post.title, newStatusName, postId).catch(console.error);

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

  const appUrl = process.env.NEXTAUTH_URL || 'https://app.upvotely.io';

  for (const user of users) {
    if (!user.email) continue;

    const prefs = await db.notificationPreference.findFirst({
      where: { userId: user.id },
    });

    if (prefs && !prefs.emailStatusChange) continue;

    const html = buildStatusChangeEmail(postTitle, newStatus, postId, user.id, appUrl);
    const emailFrom = process.env.EMAIL_FROM || 'Upvotely <notifications@upvotely.io>';

    if (emailProvider === 'resend') {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: emailFrom, to: user.email, subject: `Status Update: ${postTitle}`, html }),
      }).catch(console.error);
    } else if (emailProvider === 'sendgrid') {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: user.email }] }],
          from: { email: process.env.EMAIL_FROM || 'notifications@upvotely.io' },
          subject: `Status Update: ${postTitle}`,
          content: [{ type: 'text/html', value: html }],
        }),
      }).catch(console.error);
    }
  }
}

function buildStatusChangeEmail(title: string, status: string, postId: string, userId: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="color: #7c3aed; margin: 0;">Upvotely</h2>
  </div>
  <h3 style="color: #1f2937;">Status Update</h3>
  <p style="color: #4b5563; line-height: 1.6;">Your feature request <strong>"${title}"</strong> is now <strong>${status}</strong>.</p>
  <a href="${appUrl}/post/${postId}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Post</a>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 32px;" />
  <p style="color: #9ca3af; font-size: 12px;">You received this because you voted on this post. <a href="${appUrl}/api/unsubscribe/${postId}?userId=${userId}" style="color: #9ca3af;">Unsubscribe from this post</a></p>
</body>
</html>`;
}
