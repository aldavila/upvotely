import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { validateWebhookUrl } from './webhook-policy';

export const resolveWebhookHost = (hostname: string) => lookup(hostname, { all: true, verbatim: true });

export async function requestWebhook(
  input: string,
  options: { headers: Record<string, string>; body: string; redirect: 'manual' }
): Promise<{ status: number; ok: boolean }> {
  const { url, addresses } = await validateWebhookUrl(input, resolveWebhookHost);
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    // HTTPS does not follow redirects. Pin the checked address while retaining
    // the original hostname for Host, TLS SNI and certificate verification.
    const req = request(url, {
      method: 'POST',
      headers: options.headers,
      agent: false,
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      signal: AbortSignal.timeout(10000),
    }, response => {
      const status = response.statusCode ?? 0;
      response.destroy(); // Never read or retain receiver-controlled response bodies.
      resolve({ status, ok: status >= 200 && status < 300 });
    });
    req.on('error', reject);
    req.end(options.body);
  });
}
