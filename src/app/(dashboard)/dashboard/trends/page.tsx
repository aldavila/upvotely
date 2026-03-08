'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  MessageSquare,
  ThumbsUp,
  BarChart3,
  MessageCircle,
} from 'lucide-react';

interface TrendsData {
  period: string;
  days: number;
  newPosts: number;
  newVotes: number;
  avgPostsPerDay: number;
  mostActiveBoard: string | null;
  topVoted: {
    id: string;
    title: string;
    voteCount: number;
    commentCount: number;
    status: { name: string; color: string };
    board: string;
  }[];
  mostDiscussed: {
    id: string;
    title: string;
    voteCount: number;
    commentCount: number;
    status: { name: string; color: string };
    board: string;
  }[];
  statusDistribution: {
    name: string;
    color: string;
    count: number;
  }[];
  feedbackVolume: {
    date: string;
    count: number;
  }[];
}

export default function TrendsDashboardPage() {
  const [period, setPeriod] = useState('30d');
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/posts/trends?period=${period}`)
      .then((res) => res.json())
      .then((json) => setData(json.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Trends</h1>
          <p className="text-muted-foreground">Loading trends data...</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Failed to load trends data.</p>
      </div>
    );
  }

  const maxVolume = Math.max(...data.feedbackVolume.map((d) => d.count), 1);
  const totalStatusPosts = data.statusDistribution.reduce((acc, s) => acc + s.count, 0) || 1;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trends</h1>
          <p className="text-muted-foreground">
            What&apos;s happening with your feedback
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Posts</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.newPosts}</div>
            <p className="text-xs text-muted-foreground">
              {data.avgPostsPerDay} per day avg
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Votes</CardTitle>
            <ThumbsUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.newVotes}</div>
            <p className="text-xs text-muted-foreground">This period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Avg Posts/Day</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.avgPostsPerDay}</div>
            <p className="text-xs text-muted-foreground">Feedback velocity</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Most Active Board</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold truncate">
              {data.mostActiveBoard ?? 'N/A'}
            </div>
            <p className="text-xs text-muted-foreground">Highest activity</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Voted */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ThumbsUp className="h-5 w-5" />
              Top Voted
            </CardTitle>
            <CardDescription>Most voted posts this period</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topVoted.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No posts this period.
              </p>
            ) : (
              <div className="space-y-3">
                {data.topVoted.map((post, i) => (
                  <div key={post.id} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{post.title}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{post.board}</span>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: post.status.color, color: post.status.color }}
                          >
                            {post.status.name}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" /> {post.voteCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {post.commentCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Discussed */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Most Discussed
            </CardTitle>
            <CardDescription>Posts with most comments this period</CardDescription>
          </CardHeader>
          <CardContent>
            {data.mostDiscussed.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No discussions this period.
              </p>
            ) : (
              <div className="space-y-3">
                {data.mostDiscussed.map((post, i) => (
                  <div key={post.id} className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{post.title}</p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{post.board}</span>
                          <Badge
                            variant="outline"
                            className="text-xs"
                            style={{ borderColor: post.status.color, color: post.status.color }}
                          >
                            {post.status.name}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-3 w-3" /> {post.commentCount}
                      </span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp className="h-3 w-3" /> {post.voteCount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
          <CardDescription>Posts by status across all boards</CardDescription>
        </CardHeader>
        <CardContent>
          {data.statusDistribution.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No status data available.
            </p>
          ) : (
            <div className="space-y-3">
              {data.statusDistribution.map((status) => {
                const pct = Math.round((status.count / totalStatusPosts) * 100);
                return (
                  <div key={status.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: status.color }}
                        />
                        <span className="font-medium">{status.name}</span>
                      </div>
                      <span className="text-muted-foreground">
                        {status.count} ({pct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: status.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feedback Volume */}
      <Card>
        <CardHeader>
          <CardTitle>Feedback Volume</CardTitle>
          <CardDescription>Posts submitted per day</CardDescription>
        </CardHeader>
        <CardContent>
          {data.feedbackVolume.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No feedback volume data for this period.
            </p>
          ) : (
            <div className="flex h-40 items-end gap-px">
              {data.feedbackVolume.map((day) => (
                <div
                  key={day.date}
                  className="group relative flex-1"
                  title={`${day.date}: ${day.count} posts`}
                >
                  <div
                    className="w-full rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
                    style={{
                      height: `${Math.max((day.count / maxVolume) * 100, 4)}%`,
                      minHeight: '2px',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
          {data.feedbackVolume.length > 0 && (
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>{data.feedbackVolume[0]?.date.slice(5)}</span>
              <span>{data.feedbackVolume[data.feedbackVolume.length - 1]?.date.slice(5)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
