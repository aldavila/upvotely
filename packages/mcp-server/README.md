# @upvotely/mcp-server

MCP (Model Context Protocol) server for Upvotely. Exposes feedback boards, posts, and voting as tools for AI agents.

## Setup

```bash
cd packages/mcp-server
npm install
npm run build
```

## Configuration

Set the following environment variables:

- `UPVOTELY_API_URL` — Base URL of your Upvotely instance (default: `http://localhost:3000`)
- `UPVOTELY_API_KEY` — API key with read/write scopes

## Usage with Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "upvotely": {
      "command": "node",
      "args": ["/path/to/upvotely/packages/mcp-server/dist/index.js"],
      "env": {
        "UPVOTELY_API_URL": "https://your-instance.upvotely.com",
        "UPVOTELY_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `list_boards` | List all feedback boards in the organization |
| `list_posts` | List posts with optional board, status, and sort filters |
| `get_post` | Get a single post with full details |
| `create_post` | Create a new feedback post |
| `vote` | Toggle a vote on a post |
| `search_similar` | Search for posts matching a query string |
