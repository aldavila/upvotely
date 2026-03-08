import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeFeedbackStats } from '@/lib/feedback-stats';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Users,
} from 'lucide-react';

async function getFeedbackData(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (!membership) return null;

  const [stats, recentFeedback] = await Promise.all([
    computeFeedbackStats(membership.organizationId, 30),
    db.conversationFeedback.findMany({
      where: {
        organizationId: membership.organizationId,
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        rating: 'negative',
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  return {
    organization: membership.organization,
    ...stats,
    recentNegative: recentFeedback,
  };
}

export default async function FeedbackDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getFeedbackData(session.user.id);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">No organization found.</p>
      </div>
    );
  }

  const { overview, agents, negativeThemes, dailyTrend, recentNegative } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Conversation Feedback</h1>
        <p className="text-muted-foreground">
          Satisfaction tracking across customer conversations (last 30 days)
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Satisfaction Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.satisfactionRate}%</div>
            <Progress value={overview.satisfactionRate} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Conversations</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview.total}</div>
            <p className="text-xs text-muted-foreground">Rated conversations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Positive</CardTitle>
            <ThumbsUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{overview.positive}</div>
            <p className="text-xs text-muted-foreground">Thumbs up</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Negative</CardTitle>
            <ThumbsDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overview.negative}</div>
            <p className="text-xs text-muted-foreground">Thumbs down</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* By Agent */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              By Agent
            </CardTitle>
            <CardDescription>Satisfaction rate per agent</CardDescription>
          </CardHeader>
          <CardContent>
            {agents.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No agent data available.
              </p>
            ) : (
              <div className="space-y-4">
                {agents.map((agent) => (
                  <div key={agent.agentId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {agent.agentName ?? agent.agentId}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {agent.total} conversations
                        </Badge>
                      </div>
                      <span
                        className={`text-sm font-bold ${
                          agent.satisfactionRate >= 80
                            ? 'text-green-600'
                            : agent.satisfactionRate >= 60
                              ? 'text-amber-600'
                              : 'text-red-600'
                        }`}
                      >
                        {agent.satisfactionRate}%
                      </span>
                    </div>
                    <Progress value={agent.satisfactionRate} />
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3 text-green-500" />
                        {agent.positive}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsDown className="h-3 w-3 text-red-500" />
                        {agent.negative}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Negative Feedback Themes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Negative Feedback Themes
            </CardTitle>
            <CardDescription>Common tags on negative feedback</CardDescription>
          </CardHeader>
          <CardContent>
            {negativeThemes.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No negative feedback themes found.
              </p>
            ) : (
              <div className="space-y-3">
                {negativeThemes.map((theme) => {
                  const maxCount = negativeThemes[0]?.count ?? 1;
                  const percentage = Math.round((theme.count / maxCount) * 100);
                  return (
                    <div key={theme.tag} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{theme.tag}</span>
                        <span className="text-sm text-muted-foreground">
                          {theme.count}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-red-400"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daily Satisfaction Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Satisfaction Trend</CardTitle>
          <CardDescription>Satisfaction rate over time</CardDescription>
        </CardHeader>
        <CardContent>
          {dailyTrend.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No trend data yet. Submit conversation feedback via the API.
            </p>
          ) : (
            <div className="space-y-1">
              {/* Simple bar chart representation */}
              <div className="grid grid-cols-12 gap-1 text-xs text-muted-foreground">
                <div className="col-span-2">Date</div>
                <div className="col-span-6">Satisfaction</div>
                <div className="col-span-1 text-right">Rate</div>
                <div className="col-span-1 text-right">
                  <ThumbsUp className="inline h-3 w-3" />
                </div>
                <div className="col-span-1 text-right">
                  <ThumbsDown className="inline h-3 w-3" />
                </div>
                <div className="col-span-1 text-right">Total</div>
              </div>
              {dailyTrend.slice(-14).map((day) => (
                <div
                  key={day.date}
                  className="grid grid-cols-12 items-center gap-1 py-1 text-sm"
                >
                  <div className="col-span-2 text-xs text-muted-foreground">
                    {day.date.slice(5)}
                  </div>
                  <div className="col-span-6">
                    <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-green-400"
                        style={{ width: `${day.rate}%` }}
                      />
                      <div
                        className="h-full bg-red-400"
                        style={{ width: `${100 - day.rate}%` }}
                      />
                    </div>
                  </div>
                  <div className="col-span-1 text-right text-xs font-medium">
                    {day.rate}%
                  </div>
                  <div className="col-span-1 text-right text-xs text-green-600">
                    {day.positive}
                  </div>
                  <div className="col-span-1 text-right text-xs text-red-600">
                    {day.negative}
                  </div>
                  <div className="col-span-1 text-right text-xs">{day.total}</div>
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
          <CardDescription>Latest thumbs-down conversations</CardDescription>
        </CardHeader>
        <CardContent>
          {recentNegative.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No negative feedback — great job!
            </p>
          ) : (
            <div className="space-y-4">
              {recentNegative.map((fb) => (
                <div
                  key={fb.id}
                  className="rounded-lg border border-red-100 bg-red-50/50 p-4 dark:border-red-900 dark:bg-red-950/20"
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <ThumbsDown className="h-4 w-4 text-red-500" />
                        <span className="font-medium">
                          {fb.customerName ?? fb.customerEmail ?? 'Anonymous'}
                        </span>
                        {fb.agentName && (
                          <span className="text-muted-foreground">
                            → Agent: {fb.agentName}
                          </span>
                        )}
                      </div>
                      {fb.comment && (
                        <p className="text-sm text-muted-foreground">{fb.comment}</p>
                      )}
                      {fb.tags.length > 0 && (
                        <div className="flex gap-1">
                          {fb.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(fb.createdAt).toLocaleDateString()}
                    </span>
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
