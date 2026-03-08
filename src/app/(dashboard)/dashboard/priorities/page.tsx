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
import { DollarSign, TrendingUp, Users, ArrowUpDown } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

async function getPrioritizedPosts(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });
  if (!membership) return null;

  const orgId = membership.organizationId;

  const [posts, totalMrr, totalCustomerPosts] = await Promise.all([
    db.post.findMany({
      where: {
        board: { organizationId: orgId },
        mergedIntoId: null,
        isApproved: true,
      },
      include: {
        author: { select: { id: true, name: true, image: true } },
        status: true,
        board: true,
        tags: true,
        _count: { select: { votes: true, comments: true } },
      },
      orderBy: [
        { totalRequestingMrr: { sort: 'desc', nulls: 'last' } },
        { voteCount: 'desc' },
      ],
      take: 50,
    }),
    db.post.aggregate({
      where: { board: { organizationId: orgId } },
      _sum: { totalRequestingMrr: true },
    }),
    db.post.count({
      where: {
        board: { organizationId: orgId },
        customerRequestCount: { gt: 0 },
      },
    }),
  ]);

  return {
    organization: membership.organization,
    posts,
    totalMrr: totalMrr._sum.totalRequestingMrr || 0,
    totalCustomerPosts,
  };
}

export default async function PrioritiesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getPrioritizedPosts(session.user.id);
  if (!data) return null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Priorities</h1>
        <p className="text-muted-foreground">
          Posts ranked by revenue impact and customer demand.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Requesting MRR</CardTitle>
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
            <CardTitle className="text-sm font-medium">Posts with Customer Requests</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalCustomerPosts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Ranked Posts</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.posts.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Posts List */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue-Weighted Requests</CardTitle>
          <CardDescription>Sorted by total MRR of requesting customers</CardDescription>
        </CardHeader>
        <CardContent>
          {data.posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <ArrowUpDown className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                No prioritized posts yet. Link customer requests to posts to see revenue impact.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.posts.map((post, index) => (
                <div
                  key={post.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/boards/${post.boardId}/posts/${post.id}`}
                        className="font-medium hover:underline"
                      >
                        {post.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{post.board.name}</span>
                        <span>·</span>
                        <span>{formatRelativeTime(post.createdAt)}</span>
                        <span>·</span>
                        <span>{post._count.votes} votes</span>
                        {post.customerRequestCount > 0 && (
                          <>
                            <span>·</span>
                            <span>{post.customerRequestCount} customer requests</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {(post.totalRequestingMrr ?? 0) > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-semibold text-green-600">
                          ${Math.round(post.totalRequestingMrr ?? 0).toLocaleString()}/mo
                        </div>
                        <div className="text-xs text-muted-foreground">requesting MRR</div>
                      </div>
                    )}
                    <Badge
                      variant="outline"
                      style={{ borderColor: post.status.color, color: post.status.color }}
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
