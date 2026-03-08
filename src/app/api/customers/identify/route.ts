import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateApiKey } from '@/lib/api-auth';
import { identifyCustomerSchema } from '@/lib/validators';

/**
 * Identify API — JS SDK style upsert endpoint.
 * Creates or updates a customer record based on externalId.
 *
 * POST /api/customers/identify
 * Authorization: Bearer <api-key>
 * Body: { externalId, name?, email?, company?, mrr?, plan?, attributes? }
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const authResult = await authenticateApiKey(req, 'write');
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = identifyCustomerSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.issues },
        { status: 400 }
      );
    }

    const { externalId, name, email, company, mrr, plan, attributes } = parseResult.data;

    const customer = await db.customer.upsert({
      where: {
        organizationId_externalId: {
          organizationId: authResult.organizationId,
          externalId,
        },
      },
      create: {
        organizationId: authResult.organizationId,
        externalId,
        name,
        email,
        company,
        mrr: mrr ?? 0,
        plan,
        attributes: attributes ?? undefined,
      },
      update: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(company !== undefined && { company }),
        ...(mrr !== undefined && { mrr }),
        ...(plan !== undefined && { plan }),
        ...(attributes !== undefined && { attributes }),
      },
      include: {
        _count: { select: { customerRequests: true } },
      },
    });

    // If MRR may have changed, recalculate priority for all linked posts
    if (mrr !== undefined) {
      const linkedRequests = await db.customerRequest.findMany({
        where: { customerId: customer.id },
        select: { postId: true },
      });

      for (const req of linkedRequests) {
        const aggregate = await db.customer.aggregate({
          _sum: { mrr: true },
          where: {
            customerRequests: { some: { postId: req.postId } },
          },
        });

        const totalMrr = aggregate._sum.mrr ?? 0;
        const requestCount = await db.customerRequest.count({
          where: { postId: req.postId },
        });

        await db.post.update({
          where: { id: req.postId },
          data: {
            totalRequestingMrr: totalMrr,
            priorityScore: totalMrr * Math.log(requestCount + 1),
          },
        });
      }
    }

    return NextResponse.json(customer);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error identifying customer:', error);
    }
    return NextResponse.json(
      { error: 'Failed to identify customer' },
      { status: 500 }
    );
  }
}
