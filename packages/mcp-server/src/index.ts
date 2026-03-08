#!/usr/bin/env node
import { createServer } from './server.js';

async function main() {
  const apiKey = process.env.UPVOTELY_API_KEY;
  const baseUrl = process.env.UPVOTELY_BASE_URL || 'http://localhost:3000';

  if (!apiKey) {
    console.error('UPVOTELY_API_KEY environment variable is required');
    process.exit(1);
  }

  const server = createServer({ apiKey, baseUrl });

  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
