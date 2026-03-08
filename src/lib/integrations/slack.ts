import { db } from '@/lib/db';

interface SlackMessage {
  text: string;
  blocks?: unknown[];
  channel?: string;
}

export async function sendSlackNotification(
  organizationId: string,
  message: SlackMessage
): Promise<boolean> {
  const integration = await db.integration.findUnique({
    where: { organizationId_type: { organizationId, type: 'slack' } },
  });

  if (!integration?.isActive) return false;

  const config = integration.config as { webhookUrl: string; channel?: string };
  if (!config.webhookUrl) return false;

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
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
