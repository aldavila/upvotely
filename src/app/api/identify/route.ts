import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { identifyCustomerSchema } from '@/lib/validators';

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

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const apiKey = await authenticateApiKey(req);
    if (!apiKey) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    const body = await req.json();
    const parseResult = identifyCustomerSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input data', details: parseResult.error.issues.map(e => e.message) },
        { status: 400 }
      );
    }

    const data = parseResult.data;
    const organizationId = apiKey.organizationId;
    const externalId = data.externalId || data.userId;

    // Try to find existing customer by externalId or email
    let customer = null;

    if (externalId) {
      customer = await db.customer.findUnique({
        where: {
          organizationId_externalId: { organizationId, externalId },
        },
      });
    }

    if (!customer && data.email) {
      customer = await db.customer.findFirst({
        where: { organizationId, email: data.email },
      });
    }

    if (customer) {
      // Update existing customer
      customer = await db.customer.update({
        where: { id: customer.id },
        data: {
          name: data.name,
          email: data.email ?? customer.email,
          company: data.company ?? customer.company,
          plan: data.plan ?? customer.plan,
          mrr: data.mrr ?? customer.mrr,
          externalId: externalId ?? customer.externalId,
          customFields: data.customFields
            ? { ...(customer.customFields as object || {}), ...data.customFields }
            : customer.customFields,
        },
        include: { _count: { select: { requests: true } } },
      });
    } else {
      // Create new customer
      customer = await db.customer.create({
        data: {
          organizationId,
          externalId: externalId || null,
          name: data.name,
          email: data.email,
          company: data.company,
          plan: data.plan,
          mrr: data.mrr,
          customFields: data.customFields || {},
        },
        include: { _count: { select: { requests: true } } },
      });
    }

    return NextResponse.json(customer);
  } catch (error) {
    if (process.env.NODE_ENV === 'development') console.error('Error in identify:', error);
    return NextResponse.json({ error: 'Failed to identify customer' }, { status: 500 });
  }
}
