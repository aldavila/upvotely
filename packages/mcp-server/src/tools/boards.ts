import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ApiClient } from '../server.js';

export function registerBoardTools(server: McpServer, client: ApiClient) {
  server.tool(
    'list_boards',
    'List all feedback boards for the organization',
    {},
    async () => {
      const data = await client.fetch('/boards');
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
      };
    }
  );
}
