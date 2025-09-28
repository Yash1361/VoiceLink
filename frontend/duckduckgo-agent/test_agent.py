"""
Test Agent for DuckDuckGo Search Agent
Run this to test your hosted agent on Agentverse
"""

from uagents import Agent, Context, Model
from typing import Dict, Any
import asyncio

class SearchMessage(Model):
    query: str
    user_id: str = "test_user"

class ResponseMessage(Model):
    content: str
    search_data: dict = {}
    user_id: str = "test_user"

# Test Agent Configuration
test_agent = Agent(
    name="duckduckgo-tester",
    seed="test-agent-seed-12345",
    port=8002,
    endpoint=["http://localhost:8002/submit"]
)

# Your DuckDuckGo Agent Address
DUCKDUCKGO_AGENT_ADDRESS = "agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47"

# Test queries to try
TEST_QUERIES = [
    "search artificial intelligence",
    "Tell me about quantum computing", 
    "What is machine learning?",
    "I'm interested in AI applications",
    "search blockchain technology"
]

current_test = 0
responses_received = 0

@test_agent.on_event("startup")
async def send_test_query(ctx: Context):
    """Send initial test query on startup"""
    global current_test
    
    ctx.logger.info("🚀 DuckDuckGo Search Agent Tester Started")
    ctx.logger.info(f"🎯 Target Agent: {DUCKDUCKGO_AGENT_ADDRESS}")
    ctx.logger.info(f"📋 Total Test Queries: {len(TEST_QUERIES)}")
    ctx.logger.info("=" * 60)
    
    if current_test < len(TEST_QUERIES):
        query = TEST_QUERIES[current_test]
        ctx.logger.info(f"🔍 Test {current_test + 1}/{len(TEST_QUERIES)}: '{query}'")
        
        try:
            await ctx.send(DUCKDUCKGO_AGENT_ADDRESS, SearchMessage(
                query=query,
                user_id="test_user_123"
            ))
            ctx.logger.info("📤 Message sent successfully!")
        except Exception as e:
            ctx.logger.error(f"❌ Failed to send message: {e}")
        
        current_test += 1
    else:
        ctx.logger.info("✅ All tests completed!")

@test_agent.on_message(model=ResponseMessage)
async def handle_search_response(ctx: Context, sender: str, msg: ResponseMessage):
    """Handle response from DuckDuckGo agent"""
    global current_test, responses_received
    responses_received += 1
    
    ctx.logger.info("=" * 60)
    ctx.logger.info(f"📨 RESPONSE {responses_received} RECEIVED")
    ctx.logger.info(f"📬 From: {sender}")
    ctx.logger.info(f"👤 User ID: {msg.user_id}")
    ctx.logger.info(f"📝 Content length: {len(msg.content)} characters")
    ctx.logger.info(f"🔍 Search data available: {'✅ Yes' if msg.search_data else '❌ No'}")
    
    # Log first 400 characters of response
    if msg.content:
        preview = msg.content[:400] + "..." if len(msg.content) > 400 else msg.content
        ctx.logger.info("📄 Response Content:")
        ctx.logger.info("-" * 40)
        ctx.logger.info(preview)
        ctx.logger.info("-" * 40)
    
    # Show search data summary if available
    if msg.search_data:
        success = msg.search_data.get('success', 'Unknown')
        query = msg.search_data.get('query', 'Unknown')
        results_count = len(msg.search_data.get('results', []))
        ctx.logger.info(f"🔍 Search Success: {success}")
        ctx.logger.info(f"🔍 Search Query: {query}")
        ctx.logger.info(f"🔍 Results Count: {results_count}")
    
    # Wait a moment before sending next query
    await asyncio.sleep(2)
    
    # Send next test query if available
    if current_test < len(TEST_QUERIES):
        query = TEST_QUERIES[current_test]
        ctx.logger.info("=" * 60)
        ctx.logger.info(f"🔍 Test {current_test + 1}/{len(TEST_QUERIES)}: '{query}'")
        
        try:
            await ctx.send(DUCKDUCKGO_AGENT_ADDRESS, SearchMessage(
                query=query,
                user_id="test_user_123"
            ))
            ctx.logger.info("📤 Message sent successfully!")
        except Exception as e:
            ctx.logger.error(f"❌ Failed to send message: {e}")
        
        current_test += 1
    else:
        ctx.logger.info("=" * 60)
        ctx.logger.info("🎉 ALL TESTS COMPLETED!")
        ctx.logger.info(f"📊 Total Queries Sent: {len(TEST_QUERIES)}")
        ctx.logger.info(f"📊 Total Responses: {responses_received}")
        ctx.logger.info(f"📊 Success Rate: {responses_received}/{len(TEST_QUERIES)} ({(responses_received/len(TEST_QUERIES)*100):.1f}%)")
        ctx.logger.info("=" * 60)

@test_agent.on_message(model=str)
async def handle_string_response(ctx: Context, sender: str, msg: str):
    """Handle plain string responses"""
    global responses_received
    responses_received += 1
    
    ctx.logger.info("=" * 60)
    ctx.logger.info(f"📨 STRING RESPONSE {responses_received} RECEIVED")
    ctx.logger.info(f"📬 From: {sender}")
    ctx.logger.info(f"📄 Message: {msg}")
    ctx.logger.info("=" * 60)

@test_agent.on_message(model=dict)
async def handle_dict_response(ctx: Context, sender: str, msg: dict):
    """Handle dictionary responses"""
    global responses_received
    responses_received += 1
    
    ctx.logger.info("=" * 60)
    ctx.logger.info(f"📨 DICT RESPONSE {responses_received} RECEIVED")
    ctx.logger.info(f"📬 From: {sender}")
    ctx.logger.info(f"📄 Message: {msg}")
    ctx.logger.info("=" * 60)

if __name__ == "__main__":
    print("🧪 DuckDuckGo Search Agent Tester")
    print("=" * 50)
    print(f"🎯 Target Agent: {DUCKDUCKGO_AGENT_ADDRESS}")
    print(f"📋 Test Queries: {len(TEST_QUERIES)}")
    print("🚀 Starting test agent...")
    print("=" * 50)
    
    try:
        test_agent.run()
    except KeyboardInterrupt:
        print("\n\n⏹️ Test stopped by user")
        print(f"📊 Responses received: {responses_received}")
    except Exception as e:
        print(f"\n\n❌ Error running test agent: {e}")