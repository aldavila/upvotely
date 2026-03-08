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
  MessageCircle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  TrendingUp,
  Star,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';

async function getFeedbackData(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (!membership) return null;

  const orgId = membership.organizationId;

  const [total, positive, negative, neutral, byAgent, recentFeedback, recentNegative] =
    await Promise.all([
      db.conversationFeedback.count({ where: { organizationId: orgId } }),
      db.conversationFeedback.count({
        where: { organizationId: orgId, rating: { gte: 4 } },
      }),
      db.conversationFeedback.count({
        where: { organizationId: orgId, rating: { lte: 2 } },
      }),
      db.conversationFeedback.count({
        where: { organizationId: orgId, rating: 3 },
      }),
      db.conversationFeedback.groupBy({
        by: ['agentId'],
        where: { organizationId: orgId },
        _count: { id: true },
        _avg: { rating: true },
      }),
      db.conversationFeedback.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      db.conversationFeedback.findMany({
        where: { organizationId: orgId, rating: { lte: 2 } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

  const satisfactionRate = total > 0 ? Math.round((positive / total) * 1000) / 10 : 0;

  return {
    organization: membership.organization,
    overview: { total, positive, negative, neutral, satisfactionRate },
    byAgent: byAgent.map((entry) => ({
      agentId: entry.agentId || 'Unknown',
      count: entry._count.id,
      averageRating: entry._avg.rating
        ? Math.round(entry._avg.rating * 10) / 10
        : null,
    })),
    recentFeedback,
    recentNegative,
  };
}

function RatingBadge({ rating }: { rating: number }) {
  if (rating >= 4) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
        <ThumbsUp className="mr-1 h-3 w-3" />
        {rating}/5
      </Badge>
    );
  }
  if (rating <= 2) {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
        <ThumbsDown className="mr-1 h-3 w-3" />
        {rating}/5
      </Badge>
    );
  }
  return (
    <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
      <Minus className="mr-1 h-3 w-3" />
      {rating}/5
    </Badge>
  );
}

export default async function FeedbackDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getFeedbackData(session.user.id);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <MessageCircle className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-4 text-muted-foreground">No organization found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Conversation Feedback</h1>
        <p className="text-muted-foreground">
          Track satisfaction across AI agent conversations for {data.organization.name}.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Feedback</CardTitle>
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Positive</CardTitle>
            <ThumbsUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{data.overview.positive}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Negative</CardTitle>
            <ThumbsDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{data.overview.negative}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Neutral</CardTitle>
            <Minus className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{data.overview.neutral}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Satisfaction Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.overview.satisfactionRate}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Agent */}
        <Card>
          <CardHeader>
            <CardTitle>By Agent</CardTitle>
            <CardDescription>Feedback breakdown per agent</CardDescription>
          </CardHeader>
          <CardContent>
            {data.byAgent.length === 0 ? (
              <p className="text-sm text-muted-foreground">No agent data yet.</p>
            ) : (
              <div className="space-y-4">
                {data.byAgent.map((agent) => (
                  <div
                    key={agent.agentId}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{agent.agentId}</p>
                      <p className="text-sm text-muted-foreground">
                        {agent.count} {agent.count === 1 ? 'response' : 'responses'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-500" />
                      <span className="font-semibold">
                        {agent.averageRating ?? '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Negative Feedback */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Negative Feedback</CardTitle>
            <CardDescription>Low-rated conversations to investigate</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentNegative.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <ThumbsUp className="h-12 w-12 text-green-500/50" />
                <p className="mt-4 text-sm text-muted-foreground">
                  No negative feedback — great job!
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentNegative.map((item) => (
                  <div key={item.id} className="rounded-lg border border-red-200 p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RatingBadge rating={item.rating} />
                        {item.agentId && (
                          <span className="text-xs text-muted-foreground">
                            {item.agentId}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    {item.comment && (
                      <p className="mt-2 text-sm">{item.comment}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Session: {item.sessionId}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Feedback Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Feedback</CardTitle>
          <CardDescription>All conversation feedback, newest first</CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentFeedback.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <MessageCircle className="h-12 w-12 text-muted-foreground/50" />
              <p className="mt-4 text-sm text-muted-foreground">
                No feedback yet. Feedback will appear here once conversations are rated.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium">Session</th>
                    <th className="pb-3 font-medium">Agent</th>
                    <th className="pb-3 font-medium">Rating</th>
                    <th className="pb-3 font-medium">Comment</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentFeedback.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-3 font-mono text-xs">
                        {item.sessionId.slice(0, 12)}...
                      </td>
                      <td className="py-3">{item.agentId || '—'}</td>
                      <td className="py-3">
                        <RatingBadge rating={item.rating} />
                      </td>
                      <td className="max-w-xs truncate py-3">
                        {item.comment || '—'}
                      </td>
                      <td className="py-3 text-muted-foreground">
                        {formatRelativeTime(item.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
