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
import {
  DollarSign,
  TrendingUp,
  Users,
  ThumbsUp,
  MessageSquare,
} from 'lucide-react';

function formatMrr(mrr: number): string {
  if (mrr >= 100000) {
    return `$${(mrr / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }
  return `$${(mrr / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function getPrioritizedPosts(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (!membership) return null;

  const orgId = membership.organizationId;

  const [posts, boards, totalCustomers, totalMrr] = await Promise.all([
    db.post.findMany({
      where: {
        board: { organizationId: orgId },
        isApproved: true,
        mergedIntoId: null,
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
        status: true,
        board: { select: { id: true, name: true, slug: true } },
        tags: true,
        _count: {
          select: { votes: true, comments: true, customerRequests: true },
        },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { totalRequestingMrr: 'desc' },
        { voteCount: 'desc' },
      ],
      take: 50,
    }),
    db.board.findMany({
      where: { organizationId: orgId, isArchived: false },
      select: { id: true, name: true, slug: true },
    }),
    db.customer.count({ where: { organizationId: orgId } }),
    db.customer.aggregate({
      _sum: { mrr: true },
      where: { organizationId: orgId },
    }),
  ]);

  return {
    organization: membership.organization,
    posts,
    boards,
    totalCustomers,
    totalMrr: totalMrr._sum.mrr ?? 0,
  };
}

export default async function PrioritizationPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getPrioritizedPosts(session.user.id);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">No organization found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Revenue Prioritization</h1>
        <p className="text-muted-foreground">
          Feature requests sorted by requesting customer MRR
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalCustomers}</div>
            <p className="text-xs text-muted-foreground">Identified customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total MRR Tracked</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMrr(data.totalMrr)}</div>
            <p className="text-xs text-muted-foreground">Across all customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Revenue-Linked Posts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.posts.filter((p) => p.totalRequestingMrr > 0).length}
            </div>
            <p className="text-xs text-muted-foreground">Posts with customer requests</p>
          </CardContent>
        </Card>
      </div>

      {/* Prioritized Posts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Prioritized Feature Requests</CardTitle>
          <CardDescription>
            Sorted by priority score (MRR × customer count)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <DollarSign className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                No posts yet. Use the Identify API to link customers to feature requests.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 border-b px-4 py-2 text-xs font-medium text-muted-foreground">
                <div className="col-span-1">#</div>
                <div className="col-span-4">Title</div>
                <div className="col-span-2">Board</div>
                <div className="col-span-1 text-right">Votes</div>
                <div className="col-span-1 text-right">Customers</div>
                <div className="col-span-1 text-right">MRR</div>
                <div className="col-span-1 text-right">Score</div>
                <div className="col-span-1">Status</div>
              </div>
              {data.posts.map((post, index) => (
                <div
                  key={post.id}
                  className="grid grid-cols-12 gap-4 rounded-lg px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="col-span-1 flex items-center text-sm text-muted-foreground">
                    {index + 1}
                  </div>
                  <div className="col-span-4 flex items-center">
                    <span className="truncate font-medium">{post.title}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="truncate text-sm text-muted-foreground">
                      {post.board.name}
                    </span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1 text-sm">
                    <ThumbsUp className="h-3 w-3 text-muted-foreground" />
                    {post._count.votes}
                  </div>
                  <div className="col-span-1 flex items-center justify-end gap-1 text-sm">
                    <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    {post._count.customerRequests}
                  </div>
                  <div className="col-span-1 flex items-center justify-end text-sm font-medium">
                    {post.totalRequestingMrr > 0
                      ? formatMrr(post.totalRequestingMrr)
                      : '—'}
                  </div>
                  <div className="col-span-1 flex items-center justify-end text-sm font-medium">
                    {post.priorityScore > 0
                      ? post.priorityScore.toFixed(1)
                      : '—'}
                  </div>
                  <div className="col-span-1 flex items-center">
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{
                        borderColor: post.status.color,
                        color: post.status.color,
                      }}
                    >
                      {post.status.name}
                    </Badge>
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
