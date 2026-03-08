import { db } from '@/lib/db';
import { sendEmailNotification } from './email';

export type NotificationType = 'new_post' | 'status_change' | 'new_comment' | 'mention' | 'vote_milestone';

interface CreateNotificationParams {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

function toPrefKey(type: NotificationType, prefix: 'inApp' | 'email'): string {
  const map: Record<NotificationType, string> = {
    new_post: `${prefix}NewPost`,
    status_change: `${prefix}StatusChange`,
    new_comment: `${prefix}NewComment`,
    mention: `${prefix}Mention`,
    vote_milestone: `${prefix}NewPost`,
  };
  return map[type];
}

export async function createNotification(params: CreateNotificationParams) {
  const prefs = await db.notificationPreference.findUnique({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
  });

  const inAppKey = toPrefKey(params.type, 'inApp');
  const emailKey = toPrefKey(params.type, 'email');

  const shouldInApp = !prefs || (prefs as Record<string, unknown>)[inAppKey] !== false;
  const shouldEmail = !prefs || (prefs as Record<string, unknown>)[emailKey] !== false;

  if (shouldInApp) {
    await db.notification.create({ data: params });
  }

  if (shouldEmail && (!prefs || prefs.emailDigest === 'instant')) {
    sendEmailNotification({
      userId: params.userId,
      title: params.title,
      message: params.message,
      link: params.link,
    }).catch(console.error);
  }

  return { inApp: shouldInApp, email: shouldEmail };
}

export async function createBulkNotifications(
  userIds: string[],
  organizationId: string,
  type: NotificationType,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, unknown>
) {
  for (const userId of userIds) {
    await createNotification({ userId, organizationId, type, title, message, link, metadata });
  }
}
