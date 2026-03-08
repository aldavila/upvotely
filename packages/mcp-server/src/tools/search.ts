import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../server.js';

export function registerSearchTools(server: McpServer, client: ApiClient) {
  server.tool(
    'search_similar',
    'Search for posts similar to a given description. Useful for finding duplicates or related feedback.',
    {
      query: z.string().describe('The text to search for similar posts'),
      boardId: z.string().optional().describe('Optional board ID to limit search scope'),
      limit: z.number().default(10).describe('Maximum results to return'),
    },
    async ({ query, boardId, limit }) => {
      const params = new URLSearchParams({
        q: query,
        limit: String(limit || 10),
      });
      if (boardId) params.set('boardId', boardId);

      try {
        const data = await client.fetch(`/posts/search?${params}`);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      } catch {
        // Fallback: text-based search via list endpoint
        const postsParams = new URLSearchParams({ limit: '50' });
        if (boardId) postsParams.set('boardId', boardId);

        const data = await client.fetch(`/posts?${postsParams}`);
        const posts = data.posts || [];

        const queryTerms = query
          .toLowerCase()
          .split(/\s+/)
          .filter((t: string) => t.length > 2);
        const scored = posts
          .map((post: any) => {
            const text = `${post.title} ${post.content || ''}`.toLowerCase();
            const matchCount = queryTerms.filter((term: string) =>
              text.includes(term)
            ).length;
            return {
              ...post,
              similarityScore:
                matchCount / Math.max(queryTerms.length, 1),
            };
          })
          .filter((p: any) => p.similarityScore > 0)
          .sort((a: any, b: any) => b.similarityScore - a.similarityScore)
          .slice(0, limit || 10);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { posts: scored, method: 'text_match' },
                null,
                2
              ),
            },
          ],
        };
      }
    }
  );
}
