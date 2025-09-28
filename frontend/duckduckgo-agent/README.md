# 🔍 DuckDuckGo Search Agent

![tag:search](https://img.shields.io/badge/search-3D8BD3) ![tag:duckduckgo](https://img.shields.io/badge/duckduckgo-DE5833) ![tag:asi1](https://img.shields.io/badge/asi1-E85D2E) ![tag:chatprotocol](https://img.shields.io/badge/chatprotocol-1D3BD4) ![tag:summaries](https://img.shields.io/badge/summaries-28A745)

[![live](https://img.shields.io/badge/Live-8A2BE2?style=flat&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iOCIgdmlld0JveD0iMCAwIDEwIDgiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI%2BCjxwYXRoIGQ9Ik0yLjI1IDcuNUMxIDcuNSAwIDYuNSAwIDUuMjVDMCA0LjI4MTI1IDAuNjI1IDMuNDM3NSAxLjUgMy4xNDA2MkMxLjUgMy4wOTM3NSAxLjUgMy4wNDY4OCAxLjUgM0MxLjUgMS42MjUgMi42MDkzOCAwLjUgNCAwLjVDNC45MjE4OCAwLjUgNS43MzQzOCAxLjAxNTYyIDYuMTU2MjUgMS43NjU2MkM2LjM5MDYyIDEuNTkzNzUgNi42ODc1IDEuNSA3IDEuNUM3LjgyODEyIDEuNSA4LjUgMi4xNzE4OCA4LjUgM0M4LjUgMy4yMDMxMiA4LjQ1MzEyIDMuMzc1IDguMzkwNjIgMy41NDY4OEM5LjMxMjUgMy43MzQzOCAxMCA0LjU0Njg4IDEwIDUuNUMxMCA2LjYwOTM4IDkuMDkzNzUgNy41IDggNy41SDIuMjVaTTYuNzY1NjIgMy43NjU2MkM2LjkwNjI1IDMuNjI1IDYuOTA2MjUgMy4zOTA2MiA2Ljc2NTYyIDMuMjVDNi42MDkzOCAzLjA5Mzc1IDYuMzc1IDMuMDkzNzUgNi4yMzQzOCAzLjI1TDQuNSA0Ljk4NDM4TDMuNzY1NjIgNC4yNUMzLjYwOTM4IDQuMDkzNzUgMy4zNzUgNC4wOTM3NSAzLjIzNDM4IDQuMjVDMy4wNzgxMiA0LjM5MDYyIDMuMDc4MTIgNC42MjUgMy4yMzQzOCA0Ljc2NTYyTDQuMjM0MzggNS43NjU2MkM0LjM3NSA1LjkyMTg4IDQuNjA5MzggNS45MjE4OCA0Ljc2NTYyIDUuNzY1NjJMNi43NjU2MiAzLjc2NTYyWiIgZmlsbD0id2hpdGUiLz4KPC9zdmc%2BCg%3D%3D)](https://agentverse.ai/agents/details/agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47/profile)

**An ASI1-compatible uAgent that provides intelligent search capabilities using DuckDuckGo's API with smart summarization and auto AI topic detection.**

## 🚀 Quick Start

1. **Set up environment**:
   ```bash
   # Update .env file with your Agentverse API token
   ASI_ONE_API_KEY=your_actual_agentverse_token_here
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Test locally**:
   ```bash
   python agent.py
   ```

4. **Deploy to Agentverse**:
   - Go to [Agentverse Dashboard](https://agentverse.ai/dashboard)
   - Create new agent
   - Copy code from `agent.py`
   - Set agent name: "DuckDuckGo Search Agent"
   - Deploy

## 🔍 Features

- **DuckDuckGo Integration**: Searches DuckDuckGo's Instant Answer API
- **ASI1 Compatible**: Implements Agent Chat Protocol for ASI1 compatibility
- **Smart Summaries**: Formats search results into readable summaries
- **Auto AI Detection**: Automatically searches for AI topics when mentioned
- **Multiple Result Types**: Handles abstracts, definitions, answers, and related topics

## 💬 Usage Examples

The agent responds to various message formats:

### Direct Search Commands
```
"search artificial intelligence"
"search quantum computing"
"search machine learning algorithms"
```

### Natural Language Queries
```
"Tell me about artificial intelligence"
"What is quantum computing?"
"Explain machine learning"
```

### AI Topic Auto-Detection
```
"I'm interested in AI"
"Tell me about artificial intelligence applications"
```

## 🧪 Example Input/Output

### Input Model
```python
class SearchMessage(Model):
    query: str
    user_id: str = "anonymous"
```

### Example Input
```python
SearchMessage(
    query="artificial intelligence",
    user_id="user123"
)
```

### Output Model
```python
class ResponseMessage(Model):
    content: str
    search_data: dict = {}
    user_id: str = "anonymous"
```

### Example Output
```python
ResponseMessage(
    content="Here's what I found about 'artificial intelligence':\n\n📝 **Overview**: Artificial intelligence (AI) is the simulation of human intelligence in machines...",
    search_data={
        "success": True,
        "query": "artificial intelligence",
        "results": [...]
    },
    user_id="user123"
)
```

## 📋 Integration Example

Copy and paste this code into a new [Blank Agent](https://agentverse.ai/agents/create/getting-started/blank-agent) to interact with this agent:

```python
from uagents import Agent, Context, Model

class SearchMessage(Model):
    query: str
    user_id: str = "anonymous"

class ResponseMessage(Model):
    content: str
    search_data: dict = {}
    user_id: str = "anonymous"

agent = Agent()

DUCKDUCKGO_AGENT_ADDRESS = "agent1qvjj0u9yj2wfcdrv0cc5lytwmaqpgf9v9zp7a8pj4x64pswgkfy967fzj47"

query = "Tell me about artificial intelligence"

@agent.on_event("startup")
async def handle_startup(ctx: Context):
    """Send the search query to the DuckDuckGo agent on startup."""
    await ctx.send(DUCKDUCKGO_AGENT_ADDRESS, SearchMessage(query=query))
    ctx.logger.info(f"Sent search query: {query}")

@agent.on_message(ResponseMessage)
async def handle_response(ctx: Context, sender: str, msg: ResponseMessage):
    """Process the search results."""
    ctx.logger.info(f"Received response from: {sender}")
    ctx.logger.info(f"Search results:\n{msg.content}")

if __name__ == "__main__":
    agent.run()
```

### Local Agent Setup

1. **Install dependencies**:
   ```bash
   pip install uagents
   ```

2. **For local development**, replace `agent = Agent()` with:
   ```python
   agent = Agent(
       name="user",
       endpoint="http://localhost:8000/submit",
   )
   ```

3. **Run the agent**:
   ```bash
   python agent.py
   ```

## 🤖 Agent Chat Protocol (ASI1 Compatible)

### Message Format
```json
{
  "type": "chat_message",
  "content": "search artificial intelligence",
  "role": "user", 
  "user_id": "user123"
}
```

### Response Format
```json
{
  "type": "chat_message",
  "content": "Here's what I found about 'artificial intelligence':\n\n📝 **Overview**: Artificial intelligence is...",
  "role": "assistant",
  "user_id": "user123",
  "search_data": {
    "success": true,
    "query": "artificial intelligence",
    "results": [...]
  }
}
```

## 🌐 API Integration

### DuckDuckGo Instant Answer API
- **Endpoint**: `https://api.duckduckgo.com/`
- **Parameters**: 
  - `q`: Search query
  - `format`: json
  - `no_redirect`: 1
  - `no_html`: 1
  - `skip_disambig`: 1

### Result Types Handled
- **Abstract**: General overview with source
- **Answer**: Direct answers to queries
- **Definition**: Definitions with source
- **Related Topics**: Related information

## 📁 Project Structure

```
duckduckgo-agent/
├── agent.py           # Main agent code
├── .env              # Environment variables
├── requirements.txt  # Python dependencies
├── setup.py         # Setup script
├── deploy.py        # Deployment helper
└── README.md        # This file
```

## 🔧 Configuration

### Environment Variables
- `ASI_ONE_API_KEY`: Your Agentverse API token (required for deployment)

### Agent Settings
- **Name**: DuckDuckGo Search Agent
- **Port**: 8001 (for local testing)
- **Protocol**: Agent Chat Protocol (ASI1)
- **Network**: Agentverse

## 📦 Dependencies

- `uagents>=0.10.0` - uAgents framework
- `requests>=2.31.0` - HTTP requests
- `python-dotenv>=1.0.0` - Environment variables

## 🛠️ Development

### Local Testing
```bash
python agent.py
```

### Custom Search Implementation
The `search_duckduckgo()` function can be extended to support:
- Advanced query parameters
- Result filtering
- Custom formatting
- Caching mechanisms

### Protocol Extensions
The agent can be extended to support additional protocols:
- Custom search protocols
- Multi-agent communication
- Data persistence protocols

## 🌟 Example Search Results

### Query: "artificial intelligence"

**Response**:
```
Here's what I found about 'artificial intelligence':

📝 **Overview**: Artificial intelligence (AI) is the simulation of human intelligence in machines that are programmed to think and learn like humans.
   *Source: Wikipedia*

💡 **Answer**: AI is a branch of computer science dealing with intelligent behavior, learning, and adaptation in machines.

🔗 **Related**: Machine learning is a subset of AI that enables computers to learn without being explicitly programmed.
```

## 🚀 Deployment to Agentverse

1. **Get API Token**:
   - Visit [Agentverse Dashboard](https://agentverse.ai/dashboard)
   - Generate API token
   - Update `.env` file

2. **Create Agent**:
   - Use Agentverse web interface
   - Copy `agent.py` code
   - Set agent configuration
   - Deploy and start

3. **Test Agent**:
   - Send test messages
   - Verify search functionality
   - Check ASI1 compatibility

## 🔗 Links

- [Agentverse Platform](https://agentverse.ai/)
- [uAgents Documentation](https://docs.fetch.ai/uAgents/)
- [DuckDuckGo API](https://duckduckgo.com/api)
- [ASI1 Protocol](https://asi1.org/)

## 📄 License

This project is open source and available under the MIT License.