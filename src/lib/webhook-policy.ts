import { BlockList, isIP } from 'node:net';
import type { LookupAddress } from 'node:dns';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');

const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
// Special assignments, documentation and transition mechanisms (including 6to4).
for (const [address, prefix] of [
  ['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20],
] as const) blocked.addSubnet(address, prefix, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  // This also excludes mapped IPv4, NAT64, local, multicast and reserved IPv6.
  return family === 6 && globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}

export async function validateWebhookUrl(
  input: string,
  resolve: (hostname: string) => Promise<LookupAddress[]>
): Promise<{ url: URL; addresses: LookupAddress[] }> {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Invalid webhook URL');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const family = isIP(hostname);
  const addresses = family ? [{ address: hostname, family }] : await resolve(hostname);
  if (!addresses.length || addresses.some(({ address, family }) =>
    isIP(address) !== family || !isPublicAddress(address)
  )) throw new Error('Invalid webhook destination');
  return { url, addresses };
}
