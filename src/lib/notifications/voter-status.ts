import { db } from '@/lib/db';
import { notifyStatusChange } from './events';

// Compatibility entry point: every status event uses the engine's recipient,
// preference, unsubscribe, and delivery rules.
export async function notifyVotersOnStatusChange(
  postId: string, organizationId: string, oldStatusName: string, newStatusName: string,
) {
  const post = await db.post.findUnique({
    where: { id: postId }, select: { id: true, title: true, authorId: true },
  });
  if (!post || oldStatusName === newStatusName) return { notified: 0 };
  return notifyStatusChange(post, { id: oldStatusName, name: oldStatusName },
    { id: newStatusName, name: newStatusName }, organizationId);
}
