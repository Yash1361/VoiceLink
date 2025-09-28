"""
DuckDuckGo Search Agent for Agentverse
ASI1-Compatible Agent using Agent Chat Protocol
"""

import json
import requests
from uagents import Agent, Context, Protocol
from uagents.setup import fund_agent_if_low
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Agent configuration
agent = Agent(
    name="duckduckgo-search-agent",
    seed="duckduckgo-search-unique-seed",
    port=8001,
    endpoint=["http://localhost:8001/submit"],
)

# Fund agent if balance is low
fund_agent_if_low(agent.wallet.address())

# Agent Chat Protocol for ASI1 compatibility
chat_protocol = Protocol("AgentChatProtocol")

class SearchRequest:
    """Message format for search requests"""
    def __init__(self, query: str, user_id: str = None):
        self.query = query
        self.user_id = user_id
        self.type = "search_request"

class SearchResponse:
    """Message format for search responses"""
    def __init__(self, results: list, query: str, user_id: str = None):
        self.results = results
        self.query = query
        self.user_id = user_id
        self.type = "search_response"

class ChatMessage:
    """ASI1 Chat Protocol Message"""
    def __init__(self, content: str, role: str = "assistant", user_id: str = None):
        self.content = content
        self.role = role
        self.user_id = user_id
        self.type = "chat_message"

async def search_duckduckgo(query: str) -> dict:
    """
    Search DuckDuckGo using their Instant Answer API
    Returns formatted search results
    """
    try:
        # DuckDuckGo Instant Answer API
        url = "https://api.duckduckgo.com/"
        params = {
            "q": query,
            "format": "json",
            "no_redirect": "1",
            "no_html": "1",
            "skip_disambig": "1"
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        # Extract relevant information
        results = {
            "abstract": data.get("Abstract", ""),
            "abstract_source": data.get("AbstractSource", ""),
            "abstract_url": data.get("AbstractURL", ""),
            "answer": data.get("Answer", ""),
            "answer_type": data.get("AnswerType", ""),
            "definition": data.get("Definition", ""),
            "definition_source": data.get("DefinitionSource", ""),
            "definition_url": data.get("DefinitionURL", ""),
            "heading": data.get("Heading", ""),
            "image": data.get("Image", ""),
            "redirect": data.get("Redirect", ""),
            "related_topics": data.get("RelatedTopics", []),
            "results": data.get("Results", []),
            "type": data.get("Type", ""),
        }
        
        # Format results for better readability
        formatted_results = []
        
        if results["abstract"]:
            formatted_results.append({
                "type": "abstract",
                "content": results["abstract"],
                "source": results["abstract_source"],
                "url": results["abstract_url"]
            })
        
        if results["answer"]:
            formatted_results.append({
                "type": "answer",
                "content": results["answer"],
                "answer_type": results["answer_type"]
            })
        
        if results["definition"]:
            formatted_results.append({
                "type": "definition",
                "content": results["definition"],
                "source": results["definition_source"],
                "url": results["definition_url"]
            })
        
        # Add related topics
        for topic in results["related_topics"][:3]:  # Limit to top 3
            if isinstance(topic, dict) and topic.get("Text"):
                formatted_results.append({
                    "type": "related_topic",
                    "content": topic["Text"],
                    "url": topic.get("FirstURL", "")
                })
        
        return {
            "success": True,
            "query": query,
            "results": formatted_results,
            "raw_data": results
        }
        
    except requests.RequestException as e:
        return {
            "success": False,
            "error": f"Network error: {str(e)}",
            "query": query
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Search error: {str(e)}",
            "query": query
        }

def format_search_summary(search_result: dict) -> str:
    """Format search results into a readable summary"""
    if not search_result.get("success"):
        return f"Sorry, I couldn't search for '{search_result.get('query', 'unknown')}'. Error: {search_result.get('error', 'Unknown error')}"
    
    query = search_result["query"]
    results = search_result["results"]
    
    if not results:
        return f"I searched for '{query}' but didn't find any specific information. You might want to try a different search term."
    
    summary = f"Here's what I found about '{query}':\n\n"
    
    for result in results:
        if result["type"] == "abstract":
            summary += f"📝 **Overview**: {result['content']}\n"
            if result.get("source"):
                summary += f"   *Source: {result['source']}*\n"
        
        elif result["type"] == "answer":
            summary += f"💡 **Answer**: {result['content']}\n"
        
        elif result["type"] == "definition":
            summary += f"📖 **Definition**: {result['content']}\n"
            if result.get("source"):
                summary += f"   *Source: {result['source']}*\n"
        
        elif result["type"] == "related_topic":
            summary += f"🔗 **Related**: {result['content']}\n"
        
        summary += "\n"
    
    return summary.strip()

@chat_protocol.on_message(model=dict)
async def handle_chat_message(ctx: Context, sender: str, msg: dict):
    """Handle incoming chat messages following ASI1 protocol"""
    try:
        ctx.logger.info(f"Received message from {sender}: {msg}")
        
        # Extract message content
        content = msg.get("content", "")
        message_type = msg.get("type", "chat_message")
        user_id = msg.get("user_id", sender)
        
        if message_type == "search_request" or content.lower().startswith("search"):
            # Extract search query
            if message_type == "search_request":
                query = msg.get("query", content)
            else:
                # Remove "search" prefix if present
                query = content[6:].strip() if content.lower().startswith("search ") else content
            
            ctx.logger.info(f"Processing search request for: {query}")
            
            # Perform DuckDuckGo search
            search_result = await search_duckduckgo(query)
            summary = format_search_summary(search_result)
            
            # Send response following ASI1 protocol
            response = {
                "type": "chat_message",
                "content": summary,
                "role": "assistant",
                "user_id": user_id,
                "search_data": search_result if search_result.get("success") else None
            }
            
            await ctx.send(sender, response)
            
        else:
            # Handle general chat messages
            if "artificial intelligence" in content.lower() or "ai" in content.lower():
                # Automatically search for AI information
                search_result = await search_duckduckgo("artificial intelligence")
                summary = format_search_summary(search_result)
                
                response_content = f"I noticed you mentioned AI! {summary}"
            else:
                response_content = f"Hello! I'm a DuckDuckGo search agent. You can ask me to search for information by saying 'search [your query]' or just mention topics you're interested in. I'm particularly good with AI-related topics!"
            
            response = {
                "type": "chat_message",
                "content": response_content,
                "role": "assistant",
                "user_id": user_id
            }
            
            await ctx.send(sender, response)
            
    except Exception as e:
        ctx.logger.error(f"Error handling message: {e}")
        
        error_response = {
            "type": "chat_message",
            "content": f"Sorry, I encountered an error processing your request: {str(e)}",
            "role": "assistant",
            "user_id": msg.get("user_id", sender)
        }
        
        await ctx.send(sender, error_response)

@agent.on_event("startup")
async def startup_event(ctx: Context):
    """Agent startup event"""
    ctx.logger.info("DuckDuckGo Search Agent starting up...")
    
    # Test the search functionality
    test_result = await search_duckduckgo("artificial intelligence")
    if test_result.get("success"):
        ctx.logger.info("✅ DuckDuckGo search functionality verified")
    else:
        ctx.logger.error("❌ DuckDuckGo search test failed")
    
    ctx.logger.info(f"Agent address: {agent.address}")
    ctx.logger.info("Agent is ready to receive search requests!")

@agent.on_message(model=dict)
async def handle_message(ctx: Context, sender: str, msg: dict):
    """Main message handler - delegates to chat protocol"""
    await chat_protocol.handle_message(ctx, sender, msg)

# Include the chat protocol
agent.include(chat_protocol)

if __name__ == "__main__":
    print("🔍 Starting DuckDuckGo Search Agent...")
    print(f"Agent Address: {agent.address}")
    print("ASI1-Compatible Agent Chat Protocol Enabled")
    print("Ready to search DuckDuckGo!")
    agent.run()