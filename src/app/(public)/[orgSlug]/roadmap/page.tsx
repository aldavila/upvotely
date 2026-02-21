import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ThumbsUp, MessageCircle } from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

async function getRoadmap(orgSlug: string) {
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!organization) return null;

  const statuses = await db.status.findMany({
    where: {
      organizationId: organization.id,
      showOnRoadmap: true,
    },
    orderBy: { position: 'asc' },
  });

  const posts = await db.post.findMany({
    where: {
      board: { organizationId: organization.id },
      isApproved: true,
      status: { showOnRoadmap: true },
      mergedIntoId: null,
    },
    include: {
      status: true,
      board: { select: { name: true, slug: true } },
      _count: { select: { votes: true, comments: true } },
    },
    orderBy: { voteCount: 'desc' },
  });

  return { organization, statuses, posts };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug } = await params;
  const data = await getRoadmap(orgSlug);

  if (!data) return { title: 'Not Found' };

  return {
    title: `Roadmap | ${data.organization.name}`,
    description: `See what's planned and in progress for ${data.organization.name}`,
  };
}

export default async function PublicRoadmapPage({ params }: PageProps): Promise<React.ReactElement> {
  const { orgSlug } = await params;
  const data = await getRoadmap(orgSlug);

  if (!data) notFound();

  const { organization, statuses, posts } = data;

  // Group posts by status
  const postsByStatus = statuses.reduce((acc, status) => {
    acc[status.id] = posts.filter((p) => p.statusId === status.id);
    return acc;
  }, {} as Record<string, typeof posts>);

  // Calculate progress
  const completedCount = posts.filter((p) => p.status.type === 'complete').length;
  const progress = posts.length > 0 ? (completedCount / posts.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-8">
          <Link
            href={`/${organization.slug}`}
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Back to {organization.name}
          </Link>
          <h1 className="mt-4 text-3xl font-bold">Roadmap</h1>
          <p className="mt-2 text-muted-foreground">
            See what we're working on and what's coming next
          </p>
          
          {/* Progress Bar */}
          {posts.length > 0 && (
            <div className="mt-6 max-w-md">
              <div className="mb-2 flex justify-between text-sm">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-medium">
                  {completedCount} of {posts.length} complete
                </span>
              </div>
              <Progress value={progress} />
            </div>
          )}
        </div>
      </header>

      {/* Kanban Board */}
      <div className="container mx-auto px-4 py-8">
        {posts.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-lg font-medium">Nothing on the roadmap yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Check back later to see what's being planned
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            {statuses.map((status) => (
              <div key={status.id}>
                <div className="mb-4 flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: status.color }}
                  />
                  <h2 className="font-semibold">{status.name}</h2>
                  <Badge variant="secondary" className="ml-auto">
                    {postsByStatus[status.id]?.length || 0}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {(postsByStatus[status.id] || []).map((post) => (
                    <Card key={post.id} className="transition-shadow hover:shadow-md">
                      <CardContent className="p-4">
                        <Link
                          href={`/${organization.slug}/${post.board.slug}/${post.id}`}
                          className="font-medium hover:underline"
                        >
                          {post.title}
                        </Link>
                        <div className="mt-2 text-xs text-muted-foreground">
                          {post.board.name}
                        </div>
                        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            {post._count.votes}
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {post._count.comments}
                          </div>
                        </div>
                        {post.eta && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            ETA: {new Date(post.eta).toLocaleDateString()}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                  {(!postsByStatus[status.id] || postsByStatus[status.id].length === 0) && (
                    <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                      No items
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Powered by */}
      {organization.showBranding && (
        <footer className="border-t py-4">
          <div className="container mx-auto px-4 text-center">
            <Link
              href="https://upvotely.io"
              target="_blank"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Powered by Upvotely
            </Link>
          </div>
        </footer>
      )}
    </div>
  );
}
