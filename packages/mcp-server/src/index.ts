#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_BASE_URL = process.env.UPVOTELY_API_URL ?? 'http://localhost:3000';
const API_KEY = process.env.UPVOTELY_API_KEY ?? '';

async function apiRequest(
  path: string,
  options: RequestInit = {}
): Promise<unknown> {
  const url = `${API_BASE_URL}/api${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }

  return res.json();
}

const server = new McpServer({
  name: 'upvotely',
  version: '0.1.0',
});

// ==========================================
// Tool: list_boards
// ==========================================
server.tool(
  'list_boards',
  'List all feedback boards in the organization',
  {},
  async () => {
    const data = await apiRequest('/boards');
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ==========================================
// Tool: list_posts
// ==========================================
server.tool(
  'list_posts',
  'List posts from a feedback board with optional filters',
  {
    boardId: z.string().describe('The board ID to list posts from'),
    status: z.string().optional().describe('Filter by status slug (e.g., "open", "planned")'),
    sort: z
      .enum(['votes', 'newest', 'trending'])
      .optional()
      .describe('Sort order: votes (default), newest, or trending'),
    page: z.number().optional().describe('Page number (default: 1)'),
    limit: z.number().optional().describe('Results per page (default: 20, max: 100)'),
  },
  async (args) => {
    const params = new URLSearchParams();
    params.set('boardId', args.boardId);
    if (args.status) params.set('status', args.status);
    if (args.sort) params.set('sort', args.sort);
    if (args.page) params.set('page', String(args.page));
    if (args.limit) params.set('limit', String(args.limit));

    const data = await apiRequest(`/posts?${params.toString()}`);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ==========================================
// Tool: get_post
// ==========================================
server.tool(
  'get_post',
  'Get a single post by ID with full details including comments',
  {
    postId: z.string().describe('The post ID to retrieve'),
  },
  async (args) => {
    const data = await apiRequest(`/posts/${args.postId}`);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ==========================================
// Tool: create_post
// ==========================================
server.tool(
  'create_post',
  'Create a new feedback post on a board',
  {
    boardId: z.string().describe('The board ID to create the post on'),
    title: z
      .string()
      .min(3)
      .max(200)
      .describe('Post title (3-200 chars)'),
    content: z
      .string()
      .min(10)
      .max(10000)
      .describe('Post content/description (10-10000 chars)'),
    tagIds: z
      .array(z.string())
      .optional()
      .describe('Optional array of tag IDs to attach'),
  },
  async (args) => {
    const data = await apiRequest('/posts', {
      method: 'POST',
      body: JSON.stringify({
        boardId: args.boardId,
        title: args.title,
        content: args.content,
        tagIds: args.tagIds,
      }),
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ==========================================
// Tool: vote
// ==========================================
server.tool(
  'vote',
  'Toggle a vote on a post (upvote if not voted, remove if already voted)',
  {
    postId: z.string().describe('The post ID to vote on'),
  },
  async (args) => {
    const data = await apiRequest(`/posts/${args.postId}/vote`, {
      method: 'POST',
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ==========================================
// Tool: search_similar
// ==========================================
server.tool(
  'search_similar',
  'Search for posts similar to a given query string (text-based similarity)',
  {
    boardId: z.string().describe('The board ID to search in'),
    query: z.string().min(1).describe('Search query string'),
    limit: z.number().optional().describe('Max results to return (default: 10)'),
  },
  async (args) => {
    const params = new URLSearchParams();
    params.set('boardId', args.boardId);
    params.set('q', args.query);
    if (args.limit) params.set('limit', String(args.limit));

    // Use the posts endpoint with search — this is a basic text search
    // A future version can use embeddings for semantic similarity
    const data = await apiRequest(`/posts/search?${params.toString()}`);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    };
  }
);

// ==========================================
// Start the server
// ==========================================
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('MCP server error:', error);
  process.exit(1);
});
