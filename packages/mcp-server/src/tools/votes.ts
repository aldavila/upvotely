import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../server.js';

export function registerVoteTools(server: McpServer, client: ApiClient) {
  server.tool(
    'vote',
    'Toggle vote on a post (upvote if not voted, remove vote if already voted)',
    {
      postId: z.string().describe('The post ID to vote on'),
    },
    async ({ postId }) => {
      const data = await client.fetch(`/posts/${postId}/vote`, {
        method: 'POST',
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
