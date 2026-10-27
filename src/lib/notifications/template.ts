function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function safeEmailLink(link?: string): string | undefined {
  if (!link || /[\u0000-\u001f\u007f\\]/.test(link)) return undefined;
  // A single leading slash is an app path; protocol-relative URLs are not.
  if (link.startsWith('/') && !link.startsWith('//')) return escapeHtml(link);
  try {
    const url = new URL(link);
    if (url.protocol === 'https:' || url.protocol === 'http:') return escapeHtml(link);
  } catch {
    // Invalid URLs do not get a call-to-action link.
  }
  return undefined;
}

export function buildEmailTemplate(title: string, message: string, link?: string): string {
  title = escapeHtml(title);
  message = escapeHtml(message);
  link = safeEmailLink(link);
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
