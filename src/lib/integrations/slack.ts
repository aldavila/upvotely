import { db } from '@/lib/db';
import { isSlackWebhookUrl } from '../slack-security';

interface SlackMessage {
  text: string;
  blocks?: unknown[];
  channel?: string;
}

export async function sendSlackNotification(
  organizationId: string,
  message: SlackMessage,
  preference?: 'notifyOnNewPost' | 'notifyOnStatusChange' | 'notifyOnVoteMilestone'
): Promise<boolean> {
  try {
    const integration = await db.integration.findUnique({
      where: { organizationId_type: { organizationId, type: 'slack' } },
    });

    if (!integration?.isActive) return false;

    const config = integration.config;
    if (!config || typeof config !== 'object' || Array.isArray(config)) return false;
    if (!isSlackWebhookUrl(config.webhookUrl) || (preference && config[preference] === false)) return false;

    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...message,
        channel: message.channel || config.channel,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function notifyPostCreated(organizationId: string, post: {
  title: string;
  content: string;
  boardName: string;
  authorName: string | null;
  organizationSlug: string;
  boardSlug: string;
}): Promise<boolean> {
  const url = `${(process.env.NEXTAUTH_URL || '').replace(/\/$/, '')}/${encodeURIComponent(post.organizationSlug)}/${encodeURIComponent(post.boardSlug)}`;
  return sendSlackNotification(organizationId, buildPostCreatedMessage({ ...post, url }), 'notifyOnNewPost');
}

export function buildPostCreatedMessage(post: {
  title: string;
  content: string;
  boardName: string;
  authorName: string | null;
  url: string;
}): SlackMessage {
  return {
    text: `New feedback: ${post.title}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `New Feedback on ${post.boardName}` },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${post.title}*\n${post.content.slice(0, 200)}${post.content.length > 200 ? '...' : ''}`,
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `By ${post.authorName || 'Anonymous'} | <${post.url}|View Post>` },
        ],
      },
    ],
  };
}

export function buildVoteMilestoneMessage(post: {
  title: string;
  voteCount: number;
  url: string;
}): SlackMessage {
  return {
    text: `"${post.title}" reached ${post.voteCount} votes!`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*"${post.title}"* reached *${post.voteCount} votes*!\n<${post.url}|View Post>`,
        },
      },
    ],
  };
}

export function buildStatusChangeMessage(post: {
  title: string;
  oldStatus: string;
  newStatus: string;
  url: string;
}): SlackMessage {
  return {
    text: `Status changed: "${post.title}" → ${post.newStatus}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*"${post.title}"* status changed\n${post.oldStatus} → *${post.newStatus}*\n<${post.url}|View Post>`,
        },
      },
    ],
  };
}
