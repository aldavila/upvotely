import { after } from 'next/server';
import { triggerWebhook } from '@/lib/webhooks';
import { mapWebhookEvent, type WebhookEventData } from '@/lib/webhook-events';

// Call only after a successful write/transaction. Scheduling and delivery errors
// must not affect the response or log URLs, payloads, or receiver error details.
export function emitWebhook<E extends keyof WebhookEventData>(
  organizationId: string,
  event: E,
  data: WebhookEventData[E],
): void {
  try {
    const payload = mapWebhookEvent(event, data);
    if (!payload) return;
    after(async () => {
      try {
        await triggerWebhook(organizationId, event, payload);
      } catch {
        console.error('Webhook emission failed');
      }
    });
  } catch {
    console.error('Webhook emission failed');
  }
}
