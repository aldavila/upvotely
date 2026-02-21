import { Suspense } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MessageSquare,
  ThumbsUp,
  Users,
  TrendingUp,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

async function getStats(userId: string) {
  // Get user's organization
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (!membership) {
    return null;
  }

  const orgId = membership.organizationId;

  // Get stats
  const [boardsCount, postsCount, votesCount, recentPosts] = await Promise.all([
    db.board.count({ where: { organizationId: orgId, isArchived: false } }),
    db.post.count({
      where: { board: { organizationId: orgId } },
    }),
    db.vote.count({
      where: { post: { board: { organizationId: orgId } } },
    }),
    db.post.findMany({
      where: { board: { organizationId: orgId } },
      include: {
        status: true,
        board: true,
        _count: { select: { votes: true, comments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  return {
    organization: membership.organization,
    role: membership.role,
    stats: {
      boards: boardsCount,
      posts: postsCount,
      votes: votesCount,
      engagement: postsCount > 0 ? Math.round((votesCount / postsCount) * 10) / 10 : 0,
    },
    recentPosts,
  };
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getStats(session.user.id);

  // If no organization, show onboarding
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to Upvotely!</h1>
          <p className="mt-2 text-muted-foreground">
            Let&apos;s get you set up with your first organization.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/dashboard/onboarding">
              Create Organization <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Here&apos;s what&apos;s happening with {data.organization.name}.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/boards/new">
            <Plus className="mr-2 h-4 w-4" /> New Board
          </Link>
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Posts"
          value={data.stats.posts}
          description="Feedback submissions"
          icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Total Votes"
          value={data.stats.votes}
          description="User engagements"
          icon={<ThumbsUp className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Active Boards"
          value={data.stats.boards}
          description="Feedback channels"
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          title="Avg. Engagement"
          value={`${data.stats.engagement}x`}
          description="Votes per post"
          icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Posts */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Feedback</CardTitle>
              <CardDescription>Latest submissions from your users</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/boards">
                View all <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentPosts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No feedback yet. Share your board link to start collecting!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/boards/${post.boardId}/posts/${post.id}`}
                        className="font-medium hover:underline"
                      >
                        {post.title}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{post.board.name}</span>
                        <span>•</span>
                        <span>{formatRelativeTime(post.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: post.status.color,
                          color: post.status.color,
                        }}
                      >
                        {post.status.name}
                      </Badge>
                      <span className="flex items-center gap-1 text-sm text-muted-foreground">
                        <ThumbsUp className="h-3 w-3" />
                        {post._count.votes}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks to manage your feedback</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <QuickAction
              href="/dashboard/boards/new"
              title="Create a new board"
              description="Start collecting feedback on a new topic"
            />
            <QuickAction
              href="/dashboard/changelog/new"
              title="Post an update"
              description="Let users know what you've shipped"
            />
            <QuickAction
              href="/dashboard/roadmap"
              title="Update roadmap"
              description="Plan and prioritize your features"
            />
            <QuickAction
              href="/dashboard/settings/organization"
              title="Customize branding"
              description="Make it match your brand"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function QuickAction({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted"
    >
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
