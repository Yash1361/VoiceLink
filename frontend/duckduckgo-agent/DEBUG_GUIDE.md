# 🛠️ Debugging Agent Error 15002

## 🔍 Error Analysis
- **Error Code**: 15002
- **Type**: Runtime/Import Error  
- **Location**: Agent startup failure
- **Status**: Agent shows as "running" but fails to start

## 🚨 Common Causes of Error 15002

### 1. **Import Issues**
- Missing or incorrect import statements
- Dependencies not available on Agentverse
- Syntax errors in imports

### 2. **Code Structure Problems**
- Missing required uAgents components
- Incorrect agent initialization
- Invalid Model definitions

### 3. **Runtime Dependencies**
- External libraries not supported
- Environment variables issues
- Network/API access problems

## 🔧 Solution Steps

### Step 1: Upload Fixed Code

**Use this corrected code** (copy to Agentverse):

```python
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
```

### Step 2: Upload Process

1. **Go to Agentverse Dashboard**:
   ```
   https://agentverse.ai/dashboard
   ```

2. **Find Your Agent**:
   - Look for "DuckDuckGo Search Agent"
   - Click on it

3. **Replace Code**:
   - Go to "Code" tab
   - **DELETE ALL EXISTING CODE**
   - Paste the fixed code above
   - Click "Save"

4. **Deploy**:
   - Click "Deploy" button
   - Wait for deployment to complete

### Step 3: Restart Agent

1. **Stop Current Agent**:
   - Click "Stop" if running
   - Wait for it to fully stop

2. **Start Fresh**:
   - Click "Start"
   - Monitor logs for success

### Step 4: Verify Success

**Look for these log messages**:
```
🔍 DuckDuckGo Search Agent starting up...
Agent address: agent1q...
ASI1-Compatible Agent Chat Protocol Enabled
```

## 🧪 Testing After Fix

### Quick Test via MCP Tools

```python
# Test with a simple message
test_message = {
    "query": "artificial intelligence",
    "user_id": "test_user"
}
```

### Manual Test Steps

1. **Check Agent Status**:
   - Should show "running": true
   - No error logs after startup

2. **Send Test Message**:
   - Use any agent interaction method
   - Try: "search artificial intelligence"

3. **Verify Response**:
   - Should receive formatted search results
   - Check for proper message structure

## 🔍 Alternative Minimal Agent

If the above still fails, try this ultra-minimal version:

```python
from uagents import Agent, Context, Model

agent = Agent(name="simple-search")

class SimpleMessage(Model):
    text: str

@agent.on_message(model=SimpleMessage)
async def handle_message(ctx: Context, sender: str, msg: SimpleMessage):
    response = f"You searched for: {msg.text}"
    await ctx.send(sender, SimpleMessage(text=response))

@agent.on_message(model=str)
async def handle_text(ctx: Context, sender: str, msg: str):
    response = f"Received: {msg}"
    await ctx.send(sender, response)

@agent.on_event("startup")
async def startup(ctx: Context):
    ctx.logger.info("Simple agent started")

if __name__ == "__main__":
    agent.run()
```

## ⚡ Quick Fix Checklist

- [ ] Delete all existing code in Agentverse
- [ ] Paste fixed code exactly as shown
- [ ] Save the code
- [ ] Deploy the agent  
- [ ] Stop and restart the agent
- [ ] Check logs for success messages
- [ ] Test with simple message

## 📊 Success Indicators

**✅ Fixed Successfully**:
- Agent starts without errors
- Logs show startup messages
- Responds to test messages
- No error 15002 in logs

**❌ Still Has Issues**:
- Error 15002 persists
- Agent fails to start
- No response to messages
- Runtime errors in logs

## 🆘 If Problems Persist

1. **Try Minimal Agent First**: Use the ultra-minimal version above
2. **Check Agentverse Status**: Platform issues might exist
3. **Contact Support**: Agentverse support for error 15002
4. **Create New Agent**: Sometimes a fresh agent works better

---

## 🎯 Next Steps After Fix

Once your agent is working:
1. Test basic functionality
2. Add it to marketplace
3. Monitor performance
4. Gather user feedback

Your agent address remains: `agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47`