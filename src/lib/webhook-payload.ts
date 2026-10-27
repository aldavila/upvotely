const eventTypes = [
  'post.created', 'post.updated', 'post.status_changed', 'vote.created', 'vote.removed',
  'comment.created', 'conversation.feedback.created', 'conversation.feedback.negative',
  'post.trending', 'post.ai_categorized', 'insight.weekly_summary',
] as const;

export type WebhookEventType = typeof eventTypes[number];
export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

export function isWebhookPayload(value: unknown): value is WebhookPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return eventTypes.some(event => event === payload.event) &&
    typeof payload.timestamp === 'string' &&
    !!payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data);
}
