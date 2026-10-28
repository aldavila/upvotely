import type { WebhookEventType } from './webhook-payload';

type PostData = {
  id: string;
  title: string;
  boardId: string;
  statusId: string;
  createdAt: Date | string;
};
type VoteData = { postId: string; voteCount: number };

export type WebhookEventData = {
  'post.created': PostData;
  'post.updated': PostData;
  'post.status_changed': { postId: string; oldStatusId: string; newStatusId: string };
  'vote.created': VoteData;
  'vote.removed': VoteData;
  'comment.created': { id: string; postId: string; createdAt: Date | string; isInternal: boolean };
};

type MappedEvent = keyof WebhookEventData & WebhookEventType;
type Mappers = { [E in MappedEvent]: (data: WebhookEventData[E]) => Record<string, unknown> | null };
const timestamp = (value: Date | string) => typeof value === 'string' ? value : value.toISOString();
const postPayload = (post: PostData) => ({
  id: post.id,
  title: post.title,
  boardId: post.boardId,
  statusId: post.statusId,
  createdAt: timestamp(post.createdAt),
});
const votePayload = (vote: VoteData) => ({ postId: vote.postId, voteCount: vote.voteCount });

// Explicit allowlists: never forward model rows, user identities, or content.
const mappers: Mappers = {
  'post.created': postPayload,
  'post.updated': postPayload,
  'post.status_changed': (change) => ({
    postId: change.postId, oldStatusId: change.oldStatusId, newStatusId: change.newStatusId,
  }),
  'vote.created': votePayload,
  'vote.removed': votePayload,
  // Internal/private comments must never leave the app through webhooks.
  'comment.created': (comment) => comment.isInternal ? null : ({
    id: comment.id, postId: comment.postId, createdAt: timestamp(comment.createdAt),
  }),
};

export function mapWebhookEvent<E extends MappedEvent>(event: E, data: WebhookEventData[E]) {
  return mappers[event](data);
}
