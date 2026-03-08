import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  createConversationFeedbackSchema,
  getConversationFeedbackQuerySchema,
} from '@/lib/validators';

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
    const queryResult = getConversationFeedbackQuerySchema.safeParse({
      agentId: searchParams.get('agentId') || undefined,
      rating: searchParams.get('rating') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { agentId, rating, startDate, endDate, page, limit } = queryResult.data;

    const where: any = { organizationId };
    if (agentId) where.agentId = agentId;
    if (rating !== undefined) where.rating = rating;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const [feedback, total] = await Promise.all([
      db.conversationFeedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.conversationFeedback.count({ where }),
    ]);

    return NextResponse.json({
      feedback,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching feedback:', error);
    return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const organizationId = await getOrganizationId(req);
    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createConversationFeedbackSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    const feedback = await db.conversationFeedback.create({
      data: {
        organizationId,
        sessionId: data.sessionId,
        agentId: data.agentId,
        rating: data.rating,
        comment: data.comment?.trim(),
        context: data.context || undefined,
        metadata: data.metadata || undefined,
        tags: data.tags || [],
        userId: data.userId,
      },
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating feedback:', error);
    return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 });
  }
}
