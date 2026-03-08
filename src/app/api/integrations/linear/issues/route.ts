import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createLinearIssue } from '@/lib/integrations/linear';
import { z } from 'zod';

const createIssueSchema = z.object({ postId: z.string().cuid() });

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ['owner', 'admin'] } },
    });
    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const parseResult = createIssueSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid input', details: parseResult.error.issues }, { status: 400 });
    }

    const post = await db.post.findUnique({
      where: { id: parseResult.data.postId },
      include: { board: true, status: true },
    });
    if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

    const result = await createLinearIssue(membership.organizationId, post.id, {
      title: post.title,
      description: `${post.content}\n\n**Status:** ${post.status.name}\n**Votes:** ${post.voteCount}\n**Board:** ${post.board.name}`,
    });

    if (!result) return NextResponse.json({ error: 'Failed to create Linear issue' }, { status: 500 });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Create Linear issue error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
