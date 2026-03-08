import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, DollarSign, Users } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

async function getCustomers(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (!membership) return null;

  const orgId = membership.organizationId;

  const [customers, totalMrr, totalCustomers] = await Promise.all([
    db.customer.findMany({
      where: { organizationId: orgId },
      include: { _count: { select: { requests: true } } },
      orderBy: { mrr: { sort: 'desc', nulls: 'last' } },
      take: 50,
    }),
    db.customer.aggregate({
      where: { organizationId: orgId },
      _sum: { mrr: true },
    }),
    db.customer.count({ where: { organizationId: orgId } }),
  ]);

  return {
    organization: membership.organization,
    customers,
    totalMrr: totalMrr._sum.mrr || 0,
    totalCustomers,
  };
}

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getCustomers(session.user.id);
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Customers</h1>
        <p className="text-muted-foreground">
          Customer profiles and their feedback requests.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalCustomers}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${Math.round(data.totalMrr).toLocaleString()}/mo
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg MRR</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.totalCustomers > 0 ? Math.round(data.totalMrr / data.totalCustomers).toLocaleString() : 0}/mo
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader>
          <CardTitle>All Customers</CardTitle>
          <CardDescription>Sorted by MRR, highest first</CardDescription>
        </CardHeader>
        <CardContent>
          {data.customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                No customers yet. Customers will appear here when identified via the API or SDK.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.customers.map((customer) => (
                <div
                  key={customer.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{customer.name}</span>
                      {customer.plan && (
                        <Badge variant="outline">{customer.plan}</Badge>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {customer.company && <span>{customer.company}</span>}
                      {customer.email && (
                        <>
                          {customer.company && <span>·</span>}
                          <span>{customer.email}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{customer._count.requests} requests</span>
                      <span>·</span>
                      <span>{formatRelativeTime(customer.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    {(customer.mrr ?? 0) > 0 && (
                      <div className="text-sm font-semibold text-green-600">
                        ${Math.round(customer.mrr ?? 0).toLocaleString()}/mo
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
