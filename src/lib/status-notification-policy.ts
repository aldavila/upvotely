import { createUnsubscribeToken } from './unsubscribe-token';

export function isOrganizationAdmin(
  membership: { organizationId: string; role: string } | null,
  organizationId: string
): boolean {
  return membership?.organizationId === organizationId && ['owner', 'admin'].includes(membership.role);
}

export function statusNotificationChannels(preference: {
  inAppStatusChange: boolean;
  emailStatusChange: boolean;
} | null) {
  return {
    inApp: preference?.inAppStatusChange ?? true,
    email: preference?.emailStatusChange ?? true,
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

export function buildStatusChangeEmail(title: string, status: string, postId: string, userId: string, appUrl: string, secret: string): string {
  const postUrl = `${appUrl}/post/${encodeURIComponent(postId)}`;
  const token = createUnsubscribeToken(userId, postId, secret);
  const unsubscribeUrl = `${appUrl}/api/unsubscribe/${encodeURIComponent(postId)}?userId=${encodeURIComponent(userId)}&token=${token}`;
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 24px;">
    <h2 style="color: #7c3aed; margin: 0;">Upvotely</h2>
  </div>
  <h3 style="color: #1f2937;">Status Update</h3>
  <p style="color: #4b5563; line-height: 1.6;">Your feature request <strong>"${escapeHtml(title)}"</strong> is now <strong>${escapeHtml(status)}</strong>.</p>
  <a href="${escapeHtml(postUrl)}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 6px; margin-top: 16px;">View Post</a>
  <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 32px;" />
  <p style="color: #9ca3af; font-size: 12px;">You received this because you voted on this post. <a href="${escapeHtml(unsubscribeUrl)}" style="color: #9ca3af;">Unsubscribe from this post</a></p>
</body>
</html>`;
}
