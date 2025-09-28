# Amazon MCP Agent

An Anthropic-powered shopping concierge that calls the [`amazon-mcp`](https://github.com/fewsats/amazon-mcp) server through the unified agent runtime. Users chat in natural language, Claude selects the appropriate MCP tool, and the agent returns formatted Amazon product or order information.

## Architecture

```
User Chat ─► uAgents Chat Protocol ─► AmazonMCPClient ─► amazon-mcp server
    ▲                │
    │                ▼
    └────────────── Claude (tool calling)
```

- **Chat layer** (`uagents_core.contrib.protocols.chat`): receives user prompts and maintains per-session context.
- **MCP client wrapper** (`AmazonMCPClient`): launches the `amazon-mcp` stdio server, reflects its tools, and forwards Claude tool calls.
- **Anthropic tool calling**: Claude 3.5 Sonnet inspects the tool manifest and decides which MCP tool to invoke (`amazon_search`, `get_user_orders`, etc.).
- **Formatter**: shapes JSON payloads (products, orders, payment offers) into concise, human-friendly summaries.

## Prerequisites

1. **Python deps**
   ```bash
   cd agentic_ai
   pip install uagents mcp anthropic python-dotenv
   ```
2. **uv tool runner** (only needs to be installed once). Follow the official instructions or run:
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
3. **API keys**
   ```bash
   # Required
   echo "ANTHROPIC_API_KEY=your_claude_key" >> .env

   # Optional – pass-through for amazon-mcp purchases
   echo "FEWSATS_API_KEY=your_fewsats_key" >> .env
   ```

## Running the agent

```bash
python agent.py
```

When the agent starts, it prints the local address and spins up the `amazon-mcp` server via `uvx`. Keep the process running while your ASI/Agentverse client communicates with it.

### Example prompts

- "Find me noise-cancelling headphones under $200 with good reviews."
- "Compare the battery life of popular 65% wireless keyboards."
- "Show my recent Amazon orders and their delivery status."

The response formatter highlights title, price, rating, ASIN, badges, deep links, and order metadata when available.

## Configuration knobs

Environment variables (all optional) allow you to customise how the MCP server launches or how the agent exposes itself:

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `AMAZON_MCP_COMMAND` | `uvx` | Command used to spawn the MCP server. Override if `uvx` is unavailable. |
| `AMAZON_MCP_ARGS` | `amazon-mcp` | Arguments passed to the command. Supply extra flags or a different entrypoint if needed. |
| `AMAZON_AGENT_NAME` | `amazon_agent` | Agent identity shown on the network. |
| `AMAZON_AGENT_PORT` | `8008` | HTTP port the uAgents runtime binds to. |
| `AMAZON_SESSION_TIMEOUT_SECONDS` | `1800` | Per-user session idle timeout (seconds). |

Because the server inherits the current environment, any `FEWSATS_API_KEY` present in `.env` is automatically available to `amazon-mcp` for authenticated purchases.

## How it works in code

- **`AmazonMCPClient.connect`** — launches `amazon-mcp` via stdio (`uvx amazon-mcp`), initialises the MCP session, and caches the reflected tool schema for Claude.
- **`AmazonMCPClient.process_query`** — sends the user prompt to Claude 3.5 Sonnet with the tool manifest, then executes any returned MCP tool call.
- **`AmazonMCPClient.format_response`** — normalises text/dict responses into rich Markdown summaries (`products`, `orders`, status payloads).
- **`handle_chat_message`** — keeps one MCP client per chat session, reusing the process to avoid the cost of frequent restarts.

## Adapting to another MCP server

Follow the same playbook demonstrated in the backend README:

1. Replace the launch command/args so `StdioServerParameters` targets the new MCP binary.
2. Refresh prompt wording and response formatters so they match the new tool surface.
3. Add formatter helpers for any new payload structures exposed by that server.
4. Update this documentation with setup steps specific to the new integration.

The async stdio transport, session reuse, and Claude tool-calling workflow remain identical across MCP backends.

## Troubleshooting

- **Missing `uvx`**: install the uv tool per the instructions above or set `AMAZON_MCP_COMMAND=npx` (ensure the package is installed globally).
- **Claude refuses tool calls**: confirm `ANTHROPIC_API_KEY` is valid and has access to Claude 3.5 models.
- **Purchase flows fail**: supply `FEWSATS_API_KEY` in the environment so `amazon-mcp` can authenticate with Fewsats.

Happy shopping!
