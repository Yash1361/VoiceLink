#!/usr/bin/env python3
"""Amazon MCP Agent for Agentverse.

This agent exposes the Amazon MCP server through the uAgents chat protocol so
users can search for products, review offers, and check orders from Amazon via
natural language conversations.
"""

import json
import os
import time
from contextlib import AsyncExitStack
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4

import mcp
from dotenv import load_dotenv
from mcp.client.stdio import stdio_client
from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    TextContent,
    chat_protocol_spec,
)

try:
    from anthropic import Anthropic
except ModuleNotFoundError as exc:  # pragma: no cover - import guard
    raise ModuleNotFoundError(
        "Missing optional dependency 'anthropic'. Install it with 'pip install anthropic'."
    ) from exc

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
if not ANTHROPIC_API_KEY:
    raise ValueError("ANTHROPIC_API_KEY not found. Set it in your environment or .env file.")

AGENT_NAME = os.getenv("AMAZON_AGENT_NAME", "amazon_agent")
AGENT_PORT = int(os.getenv("AMAZON_AGENT_PORT", "8008"))

AMAZON_MCP_COMMAND = os.getenv("AMAZON_MCP_COMMAND", "uvx")
_raw_args = os.getenv("AMAZON_MCP_ARGS")
if _raw_args:
    AMAZON_MCP_ARGS = _raw_args.split()
else:
    AMAZON_MCP_ARGS = ["amazon-mcp"]

default_timeout = 30 * 60  # 30 minutes
SESSION_TIMEOUT = int(os.getenv("AMAZON_SESSION_TIMEOUT_SECONDS", str(default_timeout)))

# Session storage: session_id -> metadata
user_sessions: Dict[str, Dict[str, Any]] = {}


# ---------------------------------------------------------------------------
# MCP client wrapper
# ---------------------------------------------------------------------------

class AmazonMCPClient:
    """Thin wrapper around the amazon-mcp server with Anthropic tool calling."""

    def __init__(self, ctx: Context) -> None:
        self._ctx = ctx
        self._exit_stack = AsyncExitStack()
        self._session: Optional[mcp.ClientSession] = None
        self.anthropic = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.tools: List[Dict[str, Any]] = []

    async def connect(self) -> None:
        """Launch the MCP server (if needed) and cache the tool manifest."""
        if self._session is not None:
            return

        try:
            self._ctx.logger.info(
                "Starting Amazon MCP server using '%s %s'",
                AMAZON_MCP_COMMAND,
                " ".join(AMAZON_MCP_ARGS),
            )

            server_params = mcp.StdioServerParameters(
                command=AMAZON_MCP_COMMAND,
                args=AMAZON_MCP_ARGS,
                env=None,  # inherit current environment (incl. FEWSATS_API_KEY if set)
            )

            reader, writer = await self._exit_stack.enter_async_context(
                stdio_client(server_params)
            )

            self._session = await self._exit_stack.enter_async_context(
                mcp.ClientSession(reader, writer)
            )
            await self._session.initialize()

            tools_response = await self._session.list_tools()
            self.tools = self._convert_mcp_tools_to_anthropic_format(tools_response.tools)

            self._ctx.logger.info("Amazon MCP connected with %d tools", len(self.tools))
            for tool in tools_response.tools:
                self._ctx.logger.info("Tool available: %s", tool.name)

        except Exception as exc:  # pragma: no cover - depends on runtime environment
            self._ctx.logger.error("Failed to connect to Amazon MCP server: %s", exc)
            raise

    def _convert_mcp_tools_to_anthropic_format(self, tools: List[Any]) -> List[Dict[str, Any]]:
        formatted: List[Dict[str, Any]] = []
        for tool in tools:
            formatted.append(
                {
                    "name": tool.name,
                    "description": getattr(tool, "description", "") or f"Amazon tool: {tool.name}",
                    "input_schema": getattr(tool, "inputSchema", None) or {
                        "type": "object",
                        "properties": {},
                    },
                }
            )
        return formatted

    async def process_query(self, query: str) -> str:
        """Route a natural language query through Claude tool-calling."""
        await self.connect()
        assert self._session is not None  # for type checkers

        self._ctx.logger.info("Processing query: %s", query)

        try:
            response = self.anthropic.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=2048,
                tools=self.tools,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "You are an e-commerce concierge."
                            " Use the available Amazon tools to search, summarise,"
                            " and help the shopper make informed decisions."
                            f"\n\nCustomer request: {query}"
                        ),
                    }
                ],
            )

            tool_use = next((block for block in response.content if block.type == "tool_use"), None)
            if tool_use:
                self._ctx.logger.info("Claude selected tool '%s' with input %s", tool_use.name, tool_use.input)
                tool_result = await self._session.call_tool(tool_use.name, tool_use.input)
                return self.format_response(tool_result.content)

            direct_reply = next((block for block in response.content if block.type == "text"), None)
            if direct_reply:
                return direct_reply.text

            return "I can search Amazon for products, compare offers, or look up order information."

        except Exception as exc:  # pragma: no cover - external API call
            self._ctx.logger.error("Error while processing Amazon query: %s", exc)
            return f"Sorry, something went wrong handling your Amazon request: {exc}"

    def format_response(self, content: Any) -> str:
        """Normalise the MCP content payload into a readable string."""

        data = self._extract_payload(content)

        if isinstance(data, dict):
            if "products" in data and isinstance(data["products"], list):
                return self._format_products(data)
            if "orders" in data and isinstance(data["orders"], list):
                return self._format_orders(data["orders"])
            if "status_code" in data:
                return self._format_status_payload(data)

        if isinstance(data, list) and all(isinstance(item, dict) for item in data):
            # Some endpoints might return a bare list of products/orders
            if data and "title" in data[0]:
                return self._format_products({"products": data})
            return "🛒 Amazon Data:\n" + json.dumps(data, indent=2)

        if isinstance(data, str):
            return f"🛒 Amazon Response:\n{data}"

        return "🛒 Amazon Data:\n" + json.dumps(data, indent=2)

    def _extract_payload(self, content: Any) -> Any:
        """Pull the first useful item out of the MCP content array."""
        if isinstance(content, list):
            if not content:
                return {}
            first = content[0]
            if hasattr(first, "text"):
                return self._parse_json_if_possible(first.text)
            if isinstance(first, dict):
                return first
            return content
        if isinstance(content, dict):
            return content
        if hasattr(content, "text"):
            return self._parse_json_if_possible(content.text)  # type: ignore[attr-defined]
        if isinstance(content, str):
            return self._parse_json_if_possible(content)
        return content

    def _parse_json_if_possible(self, raw: str) -> Any:
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw

    def _format_products(self, payload: Dict[str, Any]) -> str:
        products = payload.get("products", [])
        if not products:
            return "🛒 No products found for that request."

        query = payload.get("query") or payload.get("searchQuery")
        header = f"🛒 Amazon Products ({len(products)} found)"
        if query:
            header += f" for '{query}'"

        lines = [header, ""]
        for idx, product in enumerate(products[:5], start=1):
            title = product.get("title") or product.get("name") or "Untitled product"
            price = self._format_price(product.get("price"))
            rating = product.get("rating") or product.get("stars") or "No rating"
            url = product.get("url") or product.get("link") or ""
            asin = product.get("asin") or product.get("id") or ""
            badges = product.get("badges") or []

            lines.append(f"**{idx}. {title}**")
            lines.append(f"💰 {price}")
            lines.append(f"⭐ {rating}")
            if asin:
                lines.append(f"🆔 ASIN: {asin}")
            if badges:
                if isinstance(badges, list):
                    lines.append(f"🏷️ {' | '.join(str(b) for b in badges[:4])}")
                elif isinstance(badges, str):
                    lines.append(f"🏷️ {badges}")
            if url:
                lines.append(f"🔗 {url}")
            lines.append("")

        if len(products) > 5:
            lines.append(f"...and {len(products) - 5} more products available.")

        return "\n".join(lines)

    def _format_orders(self, orders: List[Dict[str, Any]]) -> str:
        if not orders:
            return "📦 No orders found for this account."

        lines = [f"📦 Amazon Orders ({len(orders)})", ""]
        for order in orders[:5]:
            order_id = order.get("external_id") or order.get("id") or order.get("orderId", "Unknown order")
            status = order.get("status") or order.get("order_status") or "Status unavailable"
            total = self._format_price(order.get("total"))
            updated = order.get("updated_at") or order.get("updatedAt")
            lines.append(f"🔖 Order: {order_id}")
            lines.append(f"📊 Status: {status}")
            if total:
                lines.append(f"💵 Total: {total}")
            if updated:
                lines.append(f"🕒 Updated: {updated}")
            lines.append("")

        if len(orders) > 5:
            lines.append(f"...and {len(orders) - 5} more orders.")

        return "\n".join(lines)

    def _format_status_payload(self, payload: Dict[str, Any]) -> str:
        status_code = payload.get("status_code")
        body = payload.get("body") or payload.get("data") or payload.get("response")
        lines = [f"🔔 Amazon returned status code {status_code}"]
        if body:
            if isinstance(body, (dict, list)):
                lines.append("```json")
                lines.append(json.dumps(body, indent=2))
                lines.append("```")
            else:
                lines.append(str(body))
        return "\n".join(lines)

    def _format_price(self, price_obj: Optional[Any]) -> str:
        if isinstance(price_obj, dict):
            amount = price_obj.get("value") or price_obj.get("amount") or price_obj.get("total")
            currency = price_obj.get("currency") or price_obj.get("currencyCode") or ""
            if amount:
                return f"{amount} {currency}".strip()
        if isinstance(price_obj, (int, float)):
            return f"{price_obj}"
        if isinstance(price_obj, str):
            return price_obj
        return "Price unavailable"

    async def cleanup(self) -> None:
        if self._exit_stack:
            await self._exit_stack.aclose()
        self._session = None
        self.tools = []


# ---------------------------------------------------------------------------
# uAgents wiring
# ---------------------------------------------------------------------------

chat_proto = Protocol(spec=chat_protocol_spec)
agent = Agent(name=AGENT_NAME, port=AGENT_PORT, mailbox=True)

amazon_clients: Dict[str, AmazonMCPClient] = {}


def is_session_valid(session_id: str) -> bool:
    if session_id not in user_sessions:
        return False
    session = user_sessions[session_id]
    now = time.time()
    if now - session["last_activity"] > SESSION_TIMEOUT:
        del user_sessions[session_id]
        return False
    session["last_activity"] = now
    return True


async def get_amazon_client(ctx: Context, session_id: str) -> AmazonMCPClient:
    if session_id not in amazon_clients:
        client = AmazonMCPClient(ctx)
        await client.connect()
        amazon_clients[session_id] = client
    return amazon_clients[session_id]


@chat_proto.on_message(model=ChatMessage)
async def handle_chat_message(ctx: Context, sender: str, msg: ChatMessage) -> None:
    try:
        if isinstance(msg.content, list) and msg.content and hasattr(msg.content[0], "text"):
            user_text = msg.content[0].text
        elif hasattr(msg.content, "text"):
            user_text = msg.content.text
        else:
            user_text = str(msg.content)
    except Exception as exc:  # pragma: no cover - defensive parsing
        ctx.logger.error("Failed to extract message text: %s", exc)
        user_text = "[Unable to parse message]"

    session_id = getattr(msg, "session_id", None) or str(uuid4())
    if not is_session_valid(session_id):
        user_sessions[session_id] = {"last_activity": time.time()}

    ctx.logger.info("Received message from %s (session %s): %s", sender, session_id, user_text)

    try:
        client = await get_amazon_client(ctx, session_id)
        reply_text = await client.process_query(user_text)
    except Exception as exc:  # pragma: no cover - runtime safety
        ctx.logger.error("Error handling chat message: %s", exc)
        reply_text = f"Sorry, I ran into an error while handling that: {exc}"

    response = ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=str(uuid4()),
        content=[TextContent(type="text", text=reply_text)],
    )

    await ctx.send(sender, response)
    ctx.logger.info("Sent response to %s", sender)


@chat_proto.on_message(model=ChatAcknowledgement)
async def handle_chat_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
    ctx.logger.info("Received acknowledgement from %s", sender)


@agent.on_event("shutdown")
async def on_shutdown(ctx: Context) -> None:
    ctx.logger.info("Cleaning up Amazon MCP clients")
    for client in list(amazon_clients.values()):
        await client.cleanup()
    amazon_clients.clear()


agent.include(chat_proto)


if __name__ == "__main__":
    print(f"Agent address: {agent.address}")
    print("🛒 Amazon MCP Agent ready for product queries.")
    agent.run()
