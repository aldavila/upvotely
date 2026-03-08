import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { createCustomerRequestSchema } from '@/lib/validators';

/**
 * Link a customer to a post (feature request).
 * Also recalculates the post's totalRequestingMrr and priorityScore.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await authenticateApiKey(req, 'write');
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await params;
    const body = await req.json();
    const parseResult = createCustomerRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { postId, priority } = parseResult.data;

    // Verify customer belongs to org
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        organizationId: authResult.organizationId,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Verify post belongs to org
    const post = await db.post.findFirst({
      where: {
        id: postId,
        board: { organizationId: authResult.organizationId },
      },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Create the request and recalculate MRR in a transaction
    const result = await db.$transaction(async (tx) => {
      const customerRequest = await tx.customerRequest.upsert({
        where: {
          customerId_postId: { customerId, postId },
        },
        create: {
          customerId,
          postId,
          priority,
        },
        update: {
          ...(priority !== undefined && { priority }),
        },
      });

      // Recalculate totalRequestingMrr for this post
      const aggregate = await tx.customer.aggregate({
        _sum: { mrr: true },
        where: {
          customerRequests: {
            some: { postId },
          },
        },
      });

      const totalMrr = aggregate._sum.mrr ?? 0;
      const requestCount = await tx.customerRequest.count({ where: { postId } });

      // Priority score = totalMrr * log(requestCount + 1)
      const priorityScore = totalMrr * Math.log(requestCount + 1);

      await tx.post.update({
        where: { id: postId },
        data: {
          totalRequestingMrr: totalMrr,
          priorityScore,
        },
      });

      return customerRequest;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error creating customer request:', error);
    }
    return NextResponse.json(
      { error: 'Failed to create customer request' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
): Promise<NextResponse> {
  try {
    const authResult = await authenticateApiKey(req, 'read');
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await params;

    // Verify customer belongs to org
    const customer = await db.customer.findFirst({
      where: {
        id: customerId,
        organizationId: authResult.organizationId,
      },
    });

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const requests = await db.customerRequest.findMany({
      where: { customerId },
      include: {
        post: {
          include: {
            status: true,
            board: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching customer requests:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch customer requests' },
      { status: 500 }
    );
  }
}
