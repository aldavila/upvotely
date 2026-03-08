import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

async function authenticateApiKey(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const key = authHeader.slice(7);
  const { createHash } = await import('crypto');
  const keyHash = createHash('sha256').update(key).digest('hex');

  const apiKey = await db.apiKey.findUnique({
    where: { keyHash },
    include: { organization: true },
  });

  if (!apiKey) return null;
  if (apiKey.expiresAt && apiKey.expiresAt < new Date()) return null;

  await db.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsedAt: new Date(), usageCount: { increment: 1 } },
  });

  return apiKey;
}

async function getOrganizationId(req: Request): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });
    return membership?.organizationId || null;
  }

  const apiKey = await authenticateApiKey(req);
  return apiKey?.organizationId || null;
}

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get('agentId') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const where: any = { organizationId };
    if (agentId) where.agentId = agentId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [total, positive, negative, neutral, byAgent, recentNegative] =
      await Promise.all([
        db.conversationFeedback.count({ where }),
        db.conversationFeedback.count({
          where: { ...where, rating: { gte: 4 } },
        }),
        db.conversationFeedback.count({
          where: { ...where, rating: { lte: 2 } },
        }),
        db.conversationFeedback.count({
          where: { ...where, rating: 3 },
        }),
        db.conversationFeedback.groupBy({
          by: ['agentId'],
          where,
          _count: { id: true },
          _avg: { rating: true },
        }),
        db.conversationFeedback.findMany({
          where: { ...where, rating: { lte: 2 } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

    const satisfactionRate = total > 0 ? (positive / total) * 100 : 0;

    return NextResponse.json({
      overview: {
        total,
        positive,
        negative,
        neutral,
        satisfactionRate: Math.round(satisfactionRate * 10) / 10,
      },
      byAgent: byAgent.map((entry) => ({
        agentId: entry.agentId,
        count: entry._count.id,
        averageRating: entry._avg.rating
          ? Math.round(entry._avg.rating * 10) / 10
          : null,
      })),
      recentNegative,
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development')
      console.error('Error fetching feedback stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch feedback stats' },
      { status: 500 }
    );
  }
}
