import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools/index.js';

interface ServerConfig {
  apiKey: string;
  baseUrl: string;
}

export interface ApiClient {
  fetch(path: string, options?: RequestInit): Promise<any>;
}

function createApiClient(config: ServerConfig): ApiClient {
  return {
    async fetch(path: string, options: RequestInit = {}) {
      const url = `${config.baseUrl}/api${path}`;
      const res = await globalThis.fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          ...options.headers,
        },
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`API error ${res.status}: ${error.error || res.statusText}`);
      }

      return res.json();
    },
  };
}

export function createServer(config: ServerConfig) {
  const server = new McpServer({
    name: 'upvotely',
    version: '0.1.0',
  });

  const client = createApiClient(config);
  registerTools(server, client);

  return server;
}
