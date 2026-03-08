import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const text = formData.get('text') as string;
    const teamId = formData.get('team_id') as string;
    const userName = formData.get('user_name') as string;
    const command = formData.get('command') as string;

    const integration = await db.integration.findFirst({
      where: {
        type: 'slack',
        isActive: true,
        config: { path: ['teamId'], equals: teamId },
      },
      include: { organization: { include: { boards: true, statuses: true } } },
    });

    if (!integration) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'This Slack workspace is not connected to any Upvotely organization.',
      });
    }

    if (!text || text.trim() === '') {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'Usage: /upvotely <title> | <description>\nExample: /upvotely Dark mode | Add dark mode support to the dashboard',
      });
    }

    const parts = text.split('|').map((p: string) => p.trim());
    const title = parts[0];
    const content = parts[1] || title;

    const org = integration.organization;
    const board = org.boards[0];
    if (!board) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'No boards found in this organization.',
      });
    }

    const defaultStatus = org.statuses.find((s) => s.isDefault) || org.statuses[0];
    if (!defaultStatus) {
      return NextResponse.json({
        response_type: 'ephemeral',
        text: 'No statuses configured. Please set up statuses in Upvotely first.',
      });
    }

    const post = await db.post.create({
      data: {
        title,
        content,
        boardId: board.id,
        statusId: defaultStatus.id,
        isAnonymous: true,
      },
    });

    await db.integrationSync.create({
      data: {
        integrationId: integration.id,
        entityType: 'post',
        entityId: post.id,
        externalId: `slack-${teamId}-${Date.now()}`,
        direction: 'inbound',
        metadata: { slackUser: userName, command },
      },
    });

    return NextResponse.json({
      response_type: 'in_channel',
      text: `Feedback created: *${title}*\nSubmitted by ${userName} via Slack`,
    });
  } catch (error) {
    console.error('Slack command error:', error);
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Something went wrong. Please try again.',
    });
  }
}
