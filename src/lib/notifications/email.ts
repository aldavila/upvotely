import { db } from '@/lib/db';
import { buildEmailTemplate } from './template';
import { buildStatusChangeEmail } from '@/lib/status-notification-policy';

interface EmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmailNotification(params: {
  userId: string;
  title: string;
  message: string;
  link?: string;
  statusEmail?: { postId: string; postTitle: string; newStatus: string };
}) {
  const user = await db.user.findUnique({ where: { id: params.userId } });
  if (!user?.email) return;

  const status = params.statusEmail;
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (status && !secret) throw new Error('UNSUBSCRIBE_TOKEN_SECRET is required');
  const html = status
    ? buildStatusChangeEmail(status.postTitle, status.newStatus, status.postId, params.userId,
      process.env.NEXTAUTH_URL || 'https://app.upvotely.io', secret!)
    : buildEmailTemplate(params.title, params.message, params.link);
  const emailParams: EmailParams = { to: user.email, subject: params.title, html };

  const emailProvider = process.env.EMAIL_PROVIDER || 'resend';

  if (emailProvider === 'resend') {
    await sendViaResend(emailParams);
  } else if (emailProvider === 'sendgrid') {
    await sendViaSendGrid(emailParams);
  }
}

async function sendViaResend(params: EmailParams) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Upvotely <notifications@upvotely.io>',
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
}

async function sendViaSendGrid(params: EmailParams) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return;

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    redirect: 'manual',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: process.env.EMAIL_FROM || 'notifications@upvotely.io' },
      subject: params.subject,
      content: [{ type: 'text/html', value: params.html }],
    }),
  });
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}`);
}
