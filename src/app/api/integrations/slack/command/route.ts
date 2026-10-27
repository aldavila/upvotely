import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashSlackConnectionCode, verifySlackRequest } from '@/lib/slack-security';
import { notifyPostCreated } from '@/lib/integrations/slack';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const rawBody = await req.text();
    if (!verifySlackRequest(rawBody, req.headers.get('X-Slack-Request-Timestamp'),
      req.headers.get('X-Slack-Signature'), process.env.SLACK_SIGNING_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const formData = new URLSearchParams(rawBody);
    const text = formData.get('text') || '';
    const teamId = formData.get('team_id');
    const userName = formData.get('user_name') || 'Anonymous';
    const command = formData.get('command');
    if (!teamId || !/^T[A-Z0-9]+$/.test(teamId) || command !== '/upvotely') {
      return NextResponse.json({ error: 'Invalid command' }, { status: 400 });
    }

    const connection = /^connect ([a-f0-9]{64})$/.exec(text.trim());
    if (connection) {
      const codeHash = hashSlackConnectionCode(connection[1]);
      // An atomic, single-use claim; the unique workspace column also prevents
      // concurrent claims by different organizations.
      const result = await db.integration.updateMany({
        where: {
          type: 'slack', isActive: true, slackTeamId: null,
          slackConnectionCodeHash: codeHash,
          slackConnectionExpiresAt: { gt: new Date() },
        },
        data: { slackTeamId: teamId, slackConnectionCodeHash: null, slackConnectionExpiresAt: null },
      });
      return NextResponse.json({
        response_type: 'ephemeral',
        text: result.count === 1 ? 'Slack workspace connected.' : 'Invalid or expired connection code. Save the integration settings to get a new code.',
      }, { status: result.count === 1 ? 200 : 400 });
    }

    const integrations = await db.integration.findMany({
      where: {
        type: 'slack',
        isActive: true,
        slackTeamId: teamId,
      },
      take: 2,
      include: { organization: { include: { boards: true, statuses: true } } },
    });
    if (integrations.length > 1) {
      return NextResponse.json({ error: 'Ambiguous workspace mapping' }, { status: 409 });
    }
    const integration = integrations[0];

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

    const separator = text.indexOf('|');
    const title = (separator < 0 ? text : text.slice(0, separator)).trim();
    const content = (separator < 0 ? '' : text.slice(separator + 1)).trim() || title;

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
        isApproved: !board.requireApproval,
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

    if (post.isApproved) {
      notifyPostCreated(integration.organizationId, {
        title, content, boardName: board.name, authorName: userName,
        organizationSlug: org.slug, boardSlug: board.slug,
      }).catch(() => {});
    }

    return NextResponse.json({
      response_type: post.isApproved ? 'in_channel' : 'ephemeral',
      text: post.isApproved ? `Feedback created: *${title}*\nSubmitted by ${userName} via Slack` : 'Feedback submitted for approval.',
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ response_type: 'ephemeral', text: 'Workspace is already connected' }, { status: 409 });
    }
    console.error('Slack command failed');
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Something went wrong. Please try again.',
    });
  }
}
