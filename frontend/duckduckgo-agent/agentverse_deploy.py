"""
Agentverse Deployment Script using MCP Tools
"""

import os
import json
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def deploy_to_agentverse():
    """Deploy agent to Agentverse using the MCP tools"""
    
    api_token = os.getenv("ASI_ONE_API_KEY")
    if not api_token or api_token == "your_agentverse_api_token_here":
        print("❌ Error: Please set ASI_ONE_API_KEY in .env file")
        print("Get your token from: https://agentverse.ai/dashboard")
        return False
    
    # Read agent code
    with open("agent.py", "r", encoding="utf-8") as f:
        agent_code = f.read()
    
    # Read README
    with open("README.md", "r", encoding="utf-8") as f:
        readme_content = f.read()
    
    agent_config = {
        "name": "DuckDuckGo Search Agent",
        "network": "agentverse",
        "readme": readme_content,
        "short_description": "ASI1-compatible agent that searches DuckDuckGo and provides intelligent summaries",
        "code": agent_code
    }
    
    print("🚀 Agent configuration prepared for Agentverse deployment")
    print(f"Name: {agent_config['name']}")
    print(f"Description: {agent_config['short_description']}")
    print(f"Code length: {len(agent_config['code'])} characters")
    
    # Instructions for manual deployment since MCP tools require valid API token
    print("\n📋 Deployment Instructions:")
    print("1. Go to https://agentverse.ai/dashboard")
    print("2. Click 'Create New Agent'")
    print("3. Set agent name: 'DuckDuckGo Search Agent'")
    print("4. Copy and paste the code from agent.py")
    print("5. Add the README content as description")
    print("6. Set these environment variables in Agentverse:")
    print("   - No additional environment variables needed")
    print("7. Deploy and start the agent")
    
    # Save deployment config
    with open("deployment_config.json", "w") as f:
        json.dump({
            "agentverse_config": {
                "name": agent_config["name"],
                "description": agent_config["short_description"],
                "protocol": "AgentChatProtocol",
                "features": [
                    "DuckDuckGo search integration",
                    "ASI1 compatibility",
                    "Agent Chat Protocol",
                    "Smart result formatting",
                    "Auto AI detection"
                ]
            }
        }, f, indent=2)
    
    print("\n✅ Deployment configuration saved to deployment_config.json")
    return True

if __name__ == "__main__":
    print("🔧 DuckDuckGo Search Agent - Agentverse Deployment")
    print("=" * 55)
    
    if deploy_to_agentverse():
        print("\n🎉 Agent is ready for deployment to Agentverse!")
    else:
        print("\n❌ Deployment preparation failed.")