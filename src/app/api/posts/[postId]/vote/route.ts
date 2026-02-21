import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { postId } = await params;

    // Get post and board
    const post = await db.post.findUnique({
      where: { id: postId },
      include: { board: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    // Check if user already voted
    const existingVote = await db.vote.findUnique({
      where: {
        postId_userId: {
          postId,
          userId: session.user.id,
        },
      },
    });

    if (existingVote) {
      // Remove vote (toggle off)
      await db.vote.delete({
        where: { id: existingVote.id },
      });

      // Decrement vote count
      await db.post.update({
        where: { id: postId },
        data: { voteCount: { decrement: 1 } },
      });

      return NextResponse.json({ voted: false, voteCount: post.voteCount - 1 });
    }

    // Add vote
    await db.vote.create({
      data: {
        postId,
        userId: session.user.id,
      },
    });

    // Increment vote count
    await db.post.update({
      where: { id: postId },
      data: { voteCount: { increment: 1 } },
    });

    return NextResponse.json({ voted: true, voteCount: post.voteCount + 1 });
  } catch (error) {
    console.error('Error voting:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
) {
  try {
    const session = await auth();
    const { postId } = await params;

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { voteCount: true },
    });

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    let hasVoted = false;
    if (session?.user?.id) {
      const vote = await db.vote.findUnique({
        where: {
          postId_userId: {
            postId,
            userId: session.user.id,
          },
        },
      });
      hasVoted = !!vote;
    }

    return NextResponse.json({
      voteCount: post.voteCount,
      hasVoted,
    });
  } catch (error) {
    console.error('Error fetching vote status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
