import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { PublicBoardView } from '@/components/boards/public-board-view';
import type { Metadata } from 'next';
import type { Prisma } from '@prisma/client';

interface PageProps {
  params: Promise<{
    orgSlug: string;
    boardSlug: string;
  }>;
  searchParams: Promise<{
    status?: string;
    sort?: string;
    q?: string;
  }>;
}

async function getBoard(orgSlug: string, boardSlug: string) {
  const organization = await db.organization.findUnique({
    where: { slug: orgSlug },
  });

  if (!organization) return null;

  const board = await db.board.findUnique({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: boardSlug,
      },
    },
    include: {
      organization: true,
      tags: true,
    },
  });

  if (!board || !board.isPublic || board.isArchived) return null;

  // Get statuses for filtering
  const statuses = await db.status.findMany({
    where: { organizationId: organization.id },
    orderBy: { position: 'asc' },
  });

  return { board, statuses };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orgSlug, boardSlug } = await params;
  const data = await getBoard(orgSlug, boardSlug);

  if (!data) {
    return { title: 'Not Found' };
  }

  const { board } = data;

  return {
    title: `${board.name} | ${board.organization.name}`,
    description: board.description || `Share your feedback for ${board.organization.name}`,
    openGraph: {
      title: `${board.name} | ${board.organization.name}`,
      description: board.description || `Share your feedback for ${board.organization.name}`,
    },
  };
}

export default async function PublicBoardPage({ params, searchParams }: PageProps): Promise<React.ReactElement> {
  const { orgSlug, boardSlug } = await params;
  const { status, sort, q } = await searchParams;
  
  const data = await getBoard(orgSlug, boardSlug);
  if (!data) notFound();

  const { board, statuses } = data;
  const session = await auth();

  // Build query with proper typing
  const where: Prisma.PostWhereInput = {
    boardId: board.id,
    isApproved: true,
    mergedIntoId: null,
  };

  if (status && status !== 'all') {
    where.status = { slug: status };
  }

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
    ];
  }

  // Build orderBy with proper typing
  let orderBy: Prisma.PostOrderByWithRelationInput | Prisma.PostOrderByWithRelationInput[];
  switch (sort) {
    case 'newest':
      orderBy = { createdAt: 'desc' };
      break;
    case 'trending':
      orderBy = [{ voteCount: 'desc' }, { createdAt: 'desc' }];
      break;
    case 'votes':
    default:
      orderBy = { voteCount: 'desc' };
  }

  const posts = await db.post.findMany({
    where,
    include: {
      author: {
        select: { id: true, name: true, image: true },
      },
      status: true,
      tags: true,
      _count: {
        select: { votes: true, comments: true },
      },
    },
    orderBy,
    take: 50,
  });

  // Get user's votes if logged in
  let userVotes: string[] = [];
  if (session?.user?.id) {
    const votes = await db.vote.findMany({
      where: {
        userId: session.user.id,
        postId: { in: posts.map((p) => p.id) },
      },
      select: { postId: true },
    });
    userVotes = votes.map((v) => v.postId);
  }

  return (
    <PublicBoardView
      board={board}
      posts={posts}
      statuses={statuses}
      userVotes={userVotes}
      user={session?.user}
      currentStatus={status}
      currentSort={sort}
      searchQuery={q}
    />
  );
}
