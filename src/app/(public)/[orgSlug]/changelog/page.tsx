import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CHANGELOG_TYPES, formatDate } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Metadata } from 'next';

interface PageProps {
  params: Promise<{ orgSlug: string }>;
}

async function getChangelog(orgSlug: string) {
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!organization) return null;

  const entries = await db.changelogEntry.findMany({
    where: {
      organizationId: organization.id,
      isPublished: true,
    },
    include: {
      linkedPosts: {
        select: {
          id: true,
          title: true,
          board: { select: { slug: true } },
        },
      },
    },
    orderBy: { publishedAt: 'desc' },
  });

  return { organization, entries };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug } = await params;
  const data = await getChangelog(orgSlug);

  if (!data) return { title: 'Not Found' };

  return {
    title: `Changelog | ${data.organization.name}`,
    description: `See what's new at ${data.organization.name}`,
  };
}

export default async function PublicChangelogPage({ params }: PageProps) {
  const { orgSlug } = await params;
  const data = await getChangelog(orgSlug);

  if (!data) notFound();

  const { organization, entries } = data;

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
          <h1 className="mt-4 text-3xl font-bold">Changelog</h1>
          <p className="mt-2 text-muted-foreground">
            All the latest updates, improvements, and fixes
          </p>
        </div>
      </header>

      {/* Entries */}
      <div className="container mx-auto max-w-3xl px-4 py-8">
        {entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <p className="text-lg font-medium">No updates yet</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Check back later for product updates
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {entries.map((entry, index) => {
              const typeInfo = CHANGELOG_TYPES[entry.type] || CHANGELOG_TYPES.other;
              
              return (
                <article key={entry.id} className="relative">
                  {/* Timeline line */}
                  {index < entries.length - 1 && (
                    <div className="absolute left-[7px] top-8 h-full w-0.5 bg-border" />
                  )}
                  
                  <div className="flex gap-4">
                    {/* Timeline dot */}
                    <div
                      className="mt-2 h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: typeInfo.color }}
                    />
                    
                    <div className="flex-1">
                      {/* Date and type */}
                      <div className="flex flex-wrap items-center gap-2">
                        <time className="text-sm text-muted-foreground">
                          {formatDate(entry.publishedAt || entry.createdAt)}
                        </time>
                        <Badge
                          style={{
                            backgroundColor: `${typeInfo.color}20`,
                            color: typeInfo.color,
                          }}
                        >
                          {typeInfo.label}
                        </Badge>
                      </div>

                      {/* Title */}
                      <h2 className="mt-2 text-xl font-semibold">{entry.title}</h2>

                      {/* Image */}
                      {entry.imageUrl && (
                        <img
                          src={entry.imageUrl}
                          alt={entry.title}
                          className="mt-4 rounded-lg border"
                        />
                      )}

                      {/* Content */}
                      <div className="prose prose-sm mt-4 max-w-none dark:prose-invert">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {entry.content}
                        </ReactMarkdown>
                      </div>

                      {/* Linked posts */}
                      {entry.linkedPosts.length > 0 && (
                        <div className="mt-4 rounded-lg bg-muted/50 p-4">
                          <p className="text-sm font-medium">Related feedback:</p>
                          <ul className="mt-2 space-y-1">
                            {entry.linkedPosts.map((post) => (
                              <li key={post.id}>
                                <Link
                                  href={`/${organization.slug}/${post.board.slug}/${post.id}`}
                                  className="text-sm text-primary hover:underline"
                                >
                                  {post.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
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
