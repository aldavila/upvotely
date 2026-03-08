import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../server.js';
import { registerBoardTools } from './boards.js';
import { registerPostTools } from './posts.js';
import { registerVoteTools } from './votes.js';
import { registerSearchTools } from './search.js';

export function registerTools(server: McpServer, client: ApiClient) {
  registerBoardTools(server, client);
  registerPostTools(server, client);
  registerVoteTools(server, client);
  registerSearchTools(server, client);
}
