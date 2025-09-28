from uagents import Agent, Context, Model
import requests
import json

# Create the agent
agent = Agent(
    name="duckduckgo-search-agent",
    seed="duckduckgo-search-unique-seed-v2",
)

class SearchMessage(Model):
    query: str
    user_id: str = "anonymous"

class ResponseMessage(Model):
    content: str
    search_data: dict = {}
    user_id: str = "anonymous"

def search_duckduckgo(query: str) -> dict:
    """Search DuckDuckGo API and return formatted results"""
    try:
        url = "https://api.duckduckgo.com/"
        params = {
            "q": query,
            "format": "json",
            "no_redirect": "1",
            "no_html": "1",
            "skip_disambig": "1"
        }
        
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        # Format results
        summary = f"Here's what I found about '{query}':\n\n"
        
        if data.get("Abstract"):
            summary += f"📝 **Overview**: {data['Abstract']}\n"
            if data.get("AbstractSource"):
                summary += f"   *Source: {data['AbstractSource']}*\n\n"
        
        if data.get("Answer"):
            summary += f"💡 **Answer**: {data['Answer']}\n\n"
        
        if data.get("Definition"):
            summary += f"📖 **Definition**: {data['Definition']}\n"
            if data.get("DefinitionSource"):
                summary += f"   *Source: {data['DefinitionSource']}*\n\n"
        
        # Add related topics
        for topic in data.get("RelatedTopics", [])[:3]:
            if isinstance(topic, dict) and topic.get("Text"):
                summary += f"🔗 **Related**: {topic['Text']}\n"
        
        if not data.get("Abstract") and not data.get("Answer") and not data.get("Definition"):
            summary = f"I searched for '{query}' but didn't find specific information. You might want to try a different search term."
        
        return {
            "success": True,
            "summary": summary.strip(),
            "raw_data": data
        }
        
    except Exception as e:
        return {
            "success": False,
            "summary": f"Sorry, I couldn't search for '{query}'. Error: {str(e)}",
            "raw_data": {}
        }

@agent.on_message(model=SearchMessage)
async def handle_search(ctx: Context, sender: str, msg: SearchMessage):
    """Handle search requests"""
    ctx.logger.info(f"Processing search for: {msg.query}")
    
    result = search_duckduckgo(msg.query)
    
    response = ResponseMessage(
        content=result["summary"],
        search_data=result["raw_data"] if result["success"] else {},
        user_id=msg.user_id
    )
    
    await ctx.send(sender, response)

@agent.on_message(model=str)
async def handle_text_message(ctx: Context, sender: str, msg: str):
    """Handle plain text messages"""
    query = msg
    
    # Handle different message types
    if msg.lower().startswith("search "):
        query = msg[7:].strip()
    elif "artificial intelligence" in msg.lower() or "ai" in msg.lower():
        query = "artificial intelligence"
    elif not query.strip():
        query = "artificial intelligence"  # default
    
    ctx.logger.info(f"Processing text query: {query}")
    
    result = search_duckduckgo(query)
    
    response = ResponseMessage(
        content=result["summary"],
        search_data=result["raw_data"] if result["success"] else {},
        user_id="text_user"
    )
    
    await ctx.send(sender, response)

@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info("🔍 DuckDuckGo Search Agent starting up...")
    ctx.logger.info(f"Agent address: {agent.address}")
    ctx.logger.info("ASI1-Compatible Agent Chat Protocol Enabled")

if __name__ == "__main__":
    agent.run()