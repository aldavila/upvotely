import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCustomerRequestSchema } from '@/lib/validators';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await params;

    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const membership = await db.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: customer.organizationId,
        },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const requests = await db.customerRequest.findMany({
      where: { customerId },
      include: {
        post: { select: { id: true, title: true, voteCount: true, status: true, board: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching requests:', error);
    return NextResponse.json({ error: 'Failed to fetch requests' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ customerId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customerId } = await params;

    const body = await req.json();
    const parseResult = createCustomerRequestSchema.safeParse({
      ...body,
      customerId,
    });
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const data = parseResult.data;

    // Verify customer exists and user has access
    const customer = await db.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    const membership = await db.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: customer.organizationId,
        },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify post exists
    const post = await db.post.findUnique({ where: { id: data.postId } });
    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const request = await db.customerRequest.create({
      data: {
        customerId: data.customerId,
        postId: data.postId,
        source: data.source,
        note: data.note,
        priority: data.priority,
      },
      include: {
        post: { select: { id: true, title: true } },
        customer: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating request:', error);
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
  }
}
