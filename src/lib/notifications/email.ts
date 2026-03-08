import { db } from '@/lib/db';

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
}) {
  const user = await db.user.findUnique({ where: { id: params.userId } });
  if (!user?.email) return;

  const html = buildEmailTemplate(params.title, params.message, params.link);
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

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'Upvotely <notifications@upvotely.io>',
      to: params.to,
      subject: params.subject,
      html: params.html,
    }),
  });
}

async function sendViaSendGrid(params: EmailParams) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) return;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: process.env.EMAIL_FROM || 'notifications@upvotely.io' },
      subject: params.subject,
      content: [{ type: 'text/html', value: params.html }],
    }),
  });
}

function buildEmailTemplate(title: string, message: string, link?: string): string {
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="color: #7c3aed; margin: 0;">Upvotely</h2>
  </div>
  <h3 style="color: #1f2937;">${title}</h3>
  <p style="color: #4b5563; line-height: 1.6;">${message}</p>
  ${link ? `<a href="${link}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Details</a>` : ''}
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 32px;" />
  <p style="color: #9ca3af; font-size: 12px;">You received this because you have notifications enabled in Upvotely.</p>
</body>
</html>`;
}
