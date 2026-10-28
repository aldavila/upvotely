import { db } from '@/lib/db';
import crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import type { WebhookEventType, WebhookPayload } from '../webhook-payload';
import { requestWebhook } from '../webhook-request';

export type { WebhookEventType } from '../webhook-payload';

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
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
      status: 'pending',
    },
  });

  // Let after() keep the bounded delivery chain alive until it settles.
  await deliverWithRetry(webhookEvent.id, org.webhookUrl, org.webhookSecret, payload);
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

      const response = await requestWebhook(url, {
        headers,
        body,
        redirect: 'manual',
      });

      if (response.ok) {
        await db.webhookEvent.update({
          where: { id: eventId },
          data: {
            status: 'sent',
            attempts: attempt,
            lastAttemptAt: new Date(),
            response: String(response.status),
          },
        });
        return;
      }

      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          attempts: attempt,
          lastAttemptAt: new Date(),
          response: String(response.status),
        },
      });
    } catch {
      await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          attempts: attempt,
          lastAttemptAt: new Date(),
          response: 'Webhook delivery failed',
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
