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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  MoreVertical,
  MessageSquare,
  ThumbsUp,
  Globe,
  Lock,
  Settings,
  ExternalLink,
  Archive,
} from 'lucide-react';

async function getBoards(userId: string) {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: { organization: true },
  });

  if (!membership) return null;

  const boards = await db.board.findMany({
    where: {
      organizationId: membership.organizationId,
      isArchived: false,
    },
    include: {
      _count: {
        select: {
          posts: true,
        },
      },
      posts: {
        select: {
          _count: {
            select: { votes: true },
          },
        },
      },
    },
    orderBy: { position: 'asc' },
  });

  return { organization: membership.organization, boards };
}

export default async function BoardsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getBoards(session.user.id);

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">
          Please create an organization first.
        </p>
      </div>
    );
  }

  const { organization, boards } = data;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Feedback Boards</h1>
          <p className="text-muted-foreground">
            Manage your feedback collection channels
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/boards/new">
            <Plus className="mr-2 h-4 w-4" /> Create Board
          </Link>
        </Button>
      </div>

      {/* Boards Grid */}
      {boards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MessageSquare className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">No boards yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Create your first feedback board to start collecting ideas from
              your users.
            </p>
            <Button className="mt-6" asChild>
              <Link href="/dashboard/boards/new">
                <Plus className="mr-2 h-4 w-4" /> Create Board
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {boards.map((board) => {
            const totalVotes = board.posts.reduce(
              (acc, post) => acc + post._count.votes,
              0
            );

            return (
              <Card key={board.id} className="group relative">
                <CardHeader className="flex flex-row items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/boards/${board.id}`}
                        className="hover:underline"
                      >
                        {board.name}
                      </Link>
                      {board.isPublic ? (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Lock className="h-4 w-4 text-muted-foreground" />
                      )}
                    </CardTitle>
                    {board.description && (
                      <CardDescription className="line-clamp-2">
                        {board.description}
                      </CardDescription>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/dashboard/boards/${board.id}`}>
                          <Settings className="mr-2 h-4 w-4" />
                          Manage
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link
                          href={`/${organization.slug}/${board.slug}`}
                          target="_blank"
                        >
                          <ExternalLink className="mr-2 h-4 w-4" />
                          View Public Page
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-4 w-4" />
                      {board._count.posts} posts
                    </div>
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="h-4 w-4" />
                      {totalVotes} votes
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    {board.allowAnonymous && (
                      <Badge variant="secondary">Anonymous</Badge>
                    )}
                    {board.requireApproval && (
                      <Badge variant="outline">Moderated</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
