import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { z } from 'zod';

const postIdSchema = z.string().cuid();

export async function POST(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const { postId } = await params;
    
    // Validate postId format
    const parseResult = postIdSchema.safeParse(postId);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

    // Use transaction to prevent race conditions
    const result = await db.$transaction(async (tx) => {
      // Get post and verify it exists
      const post = await tx.post.findUnique({
        where: { id: postId },
        include: { board: true },
      });

      if (!post) {
        throw new Error('Post not found');
      }

      // Check if user already voted
      const existingVote = await tx.vote.findUnique({
        where: {
          postId_userId: {
            postId,
            userId,
          },
        },
      });

      if (existingVote) {
        // Remove vote (toggle off)
        await tx.vote.delete({
          where: { id: existingVote.id },
        });

        // Decrement vote count atomically
        const updatedPost = await tx.post.update({
          where: { id: postId },
          data: { voteCount: { decrement: 1 } },
          select: { voteCount: true },
        });

        return { voted: false, voteCount: updatedPost.voteCount };
      }

      // Add vote
      await tx.vote.create({
        data: {
          postId,
          userId,
        },
      });

      // Increment vote count atomically
      const updatedPost = await tx.post.update({
        where: { id: postId },
        data: { voteCount: { increment: 1 } },
        select: { voteCount: true },
      });

      return { voted: true, voteCount: updatedPost.voteCount };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Post not found') {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.error('Error voting:', error);
    }
    return NextResponse.json(
      { error: 'Failed to process vote' },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ postId: string }> }
): Promise<NextResponse> {
  try {
    const session = await auth();
    const { postId } = await params;

    // Validate postId format
    const parseResult = postIdSchema.safeParse(postId);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid post ID' }, { status: 400 });
    }

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
    if (process.env.NODE_ENV === 'development') {
      console.error('Error fetching vote status:', error);
    }
    return NextResponse.json(
      { error: 'Failed to fetch vote status' },
      { status: 500 }
    );
  }
}
