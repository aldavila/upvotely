import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { effectiveEmailFrequency } from './preferences';
import { sendEmailNotification } from './email';
import { statusNotificationChannels } from '@/lib/status-notification-policy';

export type NotificationType = 'new_post' | 'status_change' | 'new_comment' | 'mention' | 'vote_milestone';

interface CreateNotificationParams {
  userId: string;
  organizationId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Prisma.InputJsonValue;
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

export async function createNotification(params: CreateNotificationParams, options: { skipEmail?: boolean; statusEmail?: { postId: string; postTitle: string; newStatus: string } } = {}) {
  const prefs = await db.notificationPreference.findUnique({
    where: { userId_organizationId: { userId: params.userId, organizationId: params.organizationId } },
  });

  const inAppKey = toPrefKey(params.type, 'inApp');
  const emailKey = toPrefKey(params.type, 'email');

  const channels = params.type === 'status_change' ? statusNotificationChannels(prefs) : null;
  const shouldInApp = channels?.inApp ?? (!prefs || (prefs as Record<string, unknown>)[inAppKey] !== false);
  const shouldEmail = !options.skipEmail && (channels?.email ?? (!prefs || (prefs as Record<string, unknown>)[emailKey] !== false))
    && effectiveEmailFrequency(prefs?.emailDigest) === 'instant';

  if (shouldInApp) {
    await db.notification.create({ data: params }).catch(console.error);
  }

  if (shouldEmail) {
    await sendEmailNotification({
      userId: params.userId,
      title: params.title,
      message: params.message,
      link: params.link,
      statusEmail: options.statusEmail,
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
  metadata?: Prisma.InputJsonValue,
  options: { skipEmail?: boolean } = {},
) {
  for (const userId of userIds) {
    await createNotification({ userId, organizationId, type, title, message, link, metadata }, options);
  }
}
