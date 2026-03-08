import { db } from '@/lib/db';
import crypto from 'crypto';

export type WebhookEventType =
  | 'post.created'
  | 'post.updated'
  | 'post.status_changed'
  | 'vote.created'
  | 'vote.removed'
  | 'comment.created'
  | 'conversation.feedback.created'
  | 'conversation.feedback.negative'
  | 'post.trending'
  | 'post.ai_categorized'
  | 'insight.weekly_summary';

interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function triggerWebhook(
  organizationId: string,
  event: WebhookEventType,
  data: Record<string, unknown>
) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { webhookUrl: true, webhookSecret: true, webhookEvents: true },
  });

  if (!org?.webhookUrl) return;
  if (org.webhookEvents.length > 0 && !org.webhookEvents.includes(event)) return;

  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const webhookEvent = await db.webhookEvent.create({
    data: {
      organizationId,
      event,
      payload: payload as unknown as Record<string, unknown>,
      status: 'pending',
    },
  });

  deliverWithRetry(webhookEvent.id, org.webhookUrl, org.webhookSecret, payload).catch(console.error);
}

export async function deliverWithRetry(
  eventId: string,
  url: string,
  secret: string | null,
  payload: WebhookPayload,
  maxAttempts = 3
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': payload.event,
        'X-Webhook-Delivery': eventId,
        'X-Webhook-Attempt': String(attempt),
      };

      if (secret) {
        const signature = crypto
          .createHmac('sha256', secret)
          .update(body)
          .digest('hex');
        headers['X-Webhook-Signature'] = `sha256=${signature}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });

      const responseText = await response.text().catch(() => '');

      if (response.ok) {
        await db.webhookEvent.update({
          where: { id: eventId },
          data: {
            status: 'sent',
            attempts: attempt,
            lastAttemptAt: new Date(),
            response: `${response.status}: ${responseText.slice(0, 500)}`,
          },
        });
        return;
      }

      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          attempts: attempt,
          lastAttemptAt: new Date(),
          response: `${response.status}: ${responseText.slice(0, 500)}`,
        },
      });
    } catch (error) {
      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          attempts: attempt,
          lastAttemptAt: new Date(),
          response: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });
    }

    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, attempt * attempt * 1000));
    }
  }

  await db.webhookEvent.update({
    where: { id: eventId },
    data: { status: 'failed' },
  });
}

export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}
