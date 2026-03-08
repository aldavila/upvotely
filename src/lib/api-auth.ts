import { db } from '@/lib/db';
import crypto from 'crypto';

export async function authenticateApiKey(
  req: Request,
  requiredScope: string = 'write'
): Promise<{ organizationId: string } | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  const apiKey = authHeader.slice(7);
  const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const key = await db.apiKey.findUnique({ where: { keyHash } });
  if (!key) return null;
  if (key.expiresAt && key.expiresAt < new Date()) return null;
  if (!key.scopes.includes(requiredScope) && !key.scopes.includes('admin')) return null;
  await db.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
  });
  return { organizationId: key.organizationId };
}
