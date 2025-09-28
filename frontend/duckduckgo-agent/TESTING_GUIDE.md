# 🧪 Testing Your Hosted DuckDuckGo Search Agent

## 🎯 Agent Details
- **Address**: `agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47`
- **Name**: DuckDuckGo Search Agent
- **Status**: Hosted on Agentverse
- **Protocol**: ASI1 Agent Chat Protocol

## 🚀 Testing Methods

### Method 1: Direct Web Testing (Agentverse Dashboard)

1. **Go to Agent Profile**:
   ```
   https://agentverse.ai/agents/details/agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47/profile
   ```

2. **Use Built-in Chat**:
   - Look for "Chat" or "Test" button on agent page
   - Send test messages directly through web interface

3. **Test Commands**:
   ```
   search artificial intelligence
   Tell me about quantum computing
   What is machine learning?
   I'm interested in AI
   ```

### Method 2: Create a Test Agent (Recommended)

Create a simple test agent to interact with your DuckDuckGo agent:

```python
from uagents import Agent, Context, Model
from typing import Dict, Any

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

@test_agent.on_event("startup")
async def send_test_query(ctx: Context):
    """Send initial test query on startup"""
    global current_test
    if current_test < len(TEST_QUERIES):
        query = TEST_QUERIES[current_test]
        ctx.logger.info(f"🔍 Sending test query {current_test + 1}: '{query}'")
        
        await ctx.send(DUCKDUCKGO_AGENT_ADDRESS, SearchMessage(
            query=query,
            user_id="test_user_123"
        ))
        current_test += 1
    else:
        ctx.logger.info("✅ All tests completed!")

@test_agent.on_message(model=ResponseMessage)
async def handle_search_response(ctx: Context, sender: str, msg: ResponseMessage):
    """Handle response from DuckDuckGo agent"""
    global current_test
    
    ctx.logger.info(f"📨 Received response from: {sender}")
    ctx.logger.info(f"👤 User ID: {msg.user_id}")
    ctx.logger.info(f"📝 Content length: {len(msg.content)} characters")
    ctx.logger.info(f"🔍 Search data available: {'Yes' if msg.search_data else 'No'}")
    
    # Log first 300 characters of response
    preview = msg.content[:300] + "..." if len(msg.content) > 300 else msg.content
    ctx.logger.info(f"📄 Response preview:\n{preview}")
    
    # Send next test query if available
    if current_test < len(TEST_QUERIES):
        query = TEST_QUERIES[current_test]
        ctx.logger.info(f"\n🔍 Sending test query {current_test + 1}: '{query}'")
        
        await ctx.send(DUCKDUCKGO_AGENT_ADDRESS, SearchMessage(
            query=query,
            user_id="test_user_123"
        ))
        current_test += 1
    else:
        ctx.logger.info("\n🎉 All test queries completed successfully!")

@test_agent.on_message(model=str)
async def handle_string_response(ctx: Context, sender: str, msg: str):
    """Handle plain string responses"""
    ctx.logger.info(f"📨 Received string response: {msg}")

if __name__ == "__main__":
    print("🧪 Starting DuckDuckGo Search Agent Tester...")
    print(f"🎯 Target Agent: {DUCKDUCKGO_AGENT_ADDRESS}")
    print(f"📋 Test Queries: {len(TEST_QUERIES)}")
    test_agent.run()
```

### Method 3: Manual Testing via Python Script

```python
import asyncio
from uagents import Agent, Context, Model

class SearchMessage(Model):
    query: str
    user_id: str = "manual_tester"

class ResponseMessage(Model):
    content: str
    search_data: dict = {}
    user_id: str = "manual_tester"

async def test_duckduckgo_agent():
    """Manual test function"""
    agent = Agent(name="manual-tester", port=8003)
    
    AGENT_ADDRESS = "agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47"
    
    @agent.on_message(model=ResponseMessage)
    async def handle_response(ctx: Context, sender: str, msg: ResponseMessage):
        print(f"\n✅ SUCCESS! Received response:")
        print(f"📝 Content: {msg.content[:200]}...")
        print(f"🔍 Has search data: {bool(msg.search_data)}")
        
    # Send test message
    test_query = input("Enter search query (or press Enter for 'artificial intelligence'): ").strip()
    if not test_query:
        test_query = "artificial intelligence"
    
    print(f"🔍 Testing query: '{test_query}'")
    print("⏳ Waiting for response...")
    
    # This would need to be run in an agent context
    # For testing, use Method 2 above instead

if __name__ == "__main__":
    print("Use Method 2 (Test Agent) for proper testing")
```

### Method 4: Web Interface Testing

If your agent has a web interface or is integrated with ASI:One:

1. **ASI:One Chat Interface**:
   - Go to ASI:One platform
   - Target your agent by address
   - Send test queries

2. **Agentverse Chat (if available)**:
   - Some agents have built-in chat interfaces
   - Check your agent's profile page

## 🧪 Test Cases to Try

### Basic Functionality Tests
```
1. "search artificial intelligence"
2. "search quantum computing" 
3. "search machine learning"
4. "search blockchain technology"
5. "search neural networks"
```

### Natural Language Tests
```
1. "Tell me about artificial intelligence"
2. "What is quantum computing?"
3. "Explain machine learning"
4. "How does blockchain work?"
5. "What are neural networks?"
```

### AI Auto-Detection Tests
```
1. "I'm interested in AI"
2. "Tell me about artificial intelligence applications"
3. "AI in healthcare"
4. "Machine learning in finance"
5. "Artificial intelligence trends"
```

### Edge Cases
```
1. "search"  (empty query)
2. "search xyz123invalid"  (no results expected)
3. "hello"  (general greeting)
4. ""  (empty message)
5. "search a"  (very short query)
```

## 📊 Expected Test Results

### Successful Response Format:
```
Here's what I found about 'artificial intelligence':

📝 **Overview**: Artificial intelligence (AI) is the simulation of human intelligence in machines...
   *Source: Wikipedia*

🔗 **Related**: Machine learning is a subset of AI that enables computers to learn...
```

### Error Response Format:
```
Sorry, I couldn't search for 'invalid-query'. Error: Network error: ...
```

### Auto-AI Detection Response:
```
I noticed you mentioned AI! Here's what I found about 'artificial intelligence':
...
```

## 🔍 Monitoring and Debugging

### Check Agent Status:
```python
# Use MCP tools to check agent status
mcp_agentverse-li_get_user_agent_details(
    address="agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47",
    api_token="your_token"
)
```

### View Agent Logs:
```python
# Get latest logs
mcp_agentverse-li_get_latest_logs_for_user_agent(
    address="agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47",
    api_token="your_token"
)
```

## 🛠️ Troubleshooting

### Common Issues:

1. **Agent Not Responding**:
   - Check if agent is running on Agentverse
   - Verify code was uploaded correctly
   - Check agent logs for errors

2. **Search API Errors**:
   - Verify DuckDuckGo API is accessible
   - Check network connectivity
   - Review error messages in logs

3. **Message Format Issues**:
   - Ensure using correct Model classes
   - Check ASI1 protocol compliance
   - Verify message structure

4. **Performance Issues**:
   - Monitor response times
   - Check for API rate limits
   - Review resource usage

## ⚡ Quick Test Commands

Save this as `quick_test.py`:

```python
from uagents import Agent, Context, Model

class SearchMessage(Model):
    query: str
    user_id: str = "quick_test"

class ResponseMessage(Model):
    content: str
    search_data: dict = {}
    user_id: str = "quick_test"

agent = Agent(name="quick-test", port=8004)
TARGET = "agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47"

@agent.on_event("startup")
async def test_ai_search(ctx: Context):
    await ctx.send(TARGET, SearchMessage(query="artificial intelligence"))

@agent.on_message(model=ResponseMessage)
async def show_result(ctx: Context, sender: str, msg: ResponseMessage):
    print(f"✅ SUCCESS: {msg.content[:100]}...")

if __name__ == "__main__":
    agent.run()
```

Run with:
```bash
python quick_test.py
```

## 📈 Performance Metrics to Track

- **Response Time**: How quickly agent responds
- **Success Rate**: Percentage of successful searches
- **Error Rate**: Frequency of errors
- **Query Types**: Most common search patterns
- **User Engagement**: Interaction frequency

Your agent is ready for comprehensive testing! Start with Method 2 (Test Agent) for the most reliable testing experience.