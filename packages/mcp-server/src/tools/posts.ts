import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../server.js';

export function registerPostTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_posts',
    'List posts on a feedback board with optional filters',
    {
      boardId: z.string().describe('The board ID to list posts from'),
      status: z.string().optional().describe('Filter by status slug'),
      sort: z.enum(['votes', 'newest', 'trending']).default('votes').describe('Sort order'),
      page: z.number().default(1).describe('Page number'),
      limit: z.number().default(20).describe('Results per page'),
    },
    async ({ boardId, status, sort, page, limit }) => {
      const params = new URLSearchParams({
        boardId,
        sort: sort || 'votes',
        page: String(page || 1),
        limit: String(limit || 20),
      });
      if (status) params.set('status', status);

      const data = await client.fetch(`/posts?${params}`);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'get_post',
    'Get full details of a specific post including votes and comments',
    {
      postId: z.string().describe('The post ID to retrieve'),
    },
    async ({ postId }) => {
      const data = await client.fetch(`/posts/${postId}`);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  server.tool(
    'create_post',
    'Create a new feedback post on a board',
    {
      boardId: z.string().describe('The board ID to create the post on'),
      title: z.string().describe('Post title'),
      content: z.string().describe('Post content/description'),
    },
    async ({ boardId, title, content }) => {
      const data = await client.fetch('/posts', {
        method: 'POST',
        body: JSON.stringify({ boardId, title, content }),
      });
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
