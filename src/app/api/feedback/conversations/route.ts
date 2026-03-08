import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { auth } from '@/lib/auth';
import {
  createConversationFeedbackSchema,
  listConversationFeedbackSchema,
} from '@/lib/validators';
import type { Prisma } from '@prisma/client';

/**
 * POST /api/feedback/conversations
 * Submit per-conversation feedback (thumbs up/down).
 * Authenticated via API key.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const authResult = await authenticateApiKey(req, 'write');
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = createConversationFeedbackSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    const feedback = await db.conversationFeedback.create({
      data: {
        organizationId: authResult.organizationId,
        conversationId: data.conversationId,
        source: data.source,
        agentName: data.agentName,
        agentId: data.agentId,
        rating: data.rating,
        comment: data.comment,
        tags: data.tags,
        customerExternalId: data.customerExternalId,
        customerEmail: data.customerEmail,
        customerName: data.customerName,
        metadata: data.metadata ?? undefined,
      },
    });

    return NextResponse.json(feedback, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating conversation feedback:', error);
    }
    return NextResponse.json(
      { error: 'Failed to create feedback' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/feedback/conversations
 * List conversation feedback. Supports filtering by rating, agent, date range.
 * Authenticated via session (dashboard) or API key.
 */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    // Try API key auth first, then session auth
    let organizationId: string | null = null;

    const apiAuth = await authenticateApiKey(req, 'read');
    if (apiAuth) {
      organizationId = apiAuth.organizationId;
    } else {
      const session = await auth();
      if (session?.user?.id) {
        const membership = await db.organizationMember.findFirst({
          where: { userId: session.user.id },
        });
        if (membership) {
          organizationId = membership.organizationId;
        }
      }
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const queryResult = listConversationFeedbackSchema.safeParse({
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
      rating: searchParams.get('rating') || undefined,
      agentId: searchParams.get('agentId') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { page, limit, rating, agentId, startDate, endDate } = queryResult.data;

    const where: Prisma.ConversationFeedbackWhereInput = {
      organizationId,
      ...(rating ? { rating } : {}),
      ...(agentId ? { agentId } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching conversation feedback:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch feedback' },
      { status: 500 }
    );
  }
}
