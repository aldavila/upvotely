import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createCustomerSchema } from '@/lib/validators';
import { z } from 'zod';

const getCustomersQuerySchema = z.object({
  search: z.string().optional(),
  sort: z.enum(['name', 'mrr', 'requests', 'createdAt']).default('createdAt'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });
    if (!membership) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const queryResult = getCustomersQuerySchema.safeParse({
      search: searchParams.get('search') || undefined,
      sort: searchParams.get('sort') || 'createdAt',
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '20',
    });

    if (!queryResult.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: queryResult.error.issues },
        { status: 400 }
      );
    }

    const { search, sort, page, limit } = queryResult.data;
    const orgId = membership.organizationId;

    const where: any = { organizationId: orgId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    let orderBy: any;
    switch (sort) {
      case 'name':
        orderBy = { name: 'asc' };
        break;
      case 'mrr':
        orderBy = { mrr: { sort: 'desc', nulls: 'last' } };
        break;
      case 'requests':
        orderBy = { requests: { _count: 'desc' } };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [customers, total] = await Promise.all([
      db.customer.findMany({
        where,
        include: { _count: { select: { requests: true } } },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.customer.count({ where }),
    ]);

    return NextResponse.json({
      customers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const parseResult = createCustomerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const data = parseResult.data;
    const customer = await db.customer.create({
      data: {
        organizationId: membership.organizationId,
        externalId: data.externalId,
        name: data.name,
        email: data.email,
        company: data.company,
        plan: data.plan,
        mrr: data.mrr,
        customFields: data.customFields || {},
      },
      include: { _count: { select: { requests: true } } },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error creating customer:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}
