"""
Setup script to deploy DuckDuckGo Search Agent to Agentverse
"""

import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def check_api_key():
    """Check if API key is set"""
    api_key = os.getenv("ASI_ONE_API_KEY")
    if not api_key or api_key == "your_agentverse_api_token_here":
        print("❌ Error: ASI_ONE_API_KEY not set in .env file")
        print("Please update the .env file with your Agentverse API token")
        print("You can get your token from: https://agentverse.ai/dashboard")
        return False
    return True

def install_dependencies():
    """Install required Python packages"""
    print("📦 Installing Python dependencies...")
    os.system("pip install -r requirements.txt")

def setup_agent():
    """Setup instructions for Agentverse deployment"""
    print("\n🤖 DuckDuckGo Search Agent Setup Complete!")
    print("\n📋 Next Steps:")
    print("1. Update .env with your actual ASI_ONE_API_KEY from Agentverse")
    print("2. Run: python agent.py (to test locally)")
    print("3. Deploy to Agentverse using their web interface")
    print("\n🔧 Agent Features:")
    print("- DuckDuckGo search integration")
    print("- ASI1-compatible Agent Chat Protocol")
    print("- Automatic AI topic detection")
    print("- Formatted search summaries")
    print("\n💡 Usage Examples:")
    print('- Send message: "search artificial intelligence"')
    print('- Send message: "Tell me about machine learning"')
    print('- Send message: "What is quantum computing?"')

if __name__ == "__main__":
    print("🔍 Setting up DuckDuckGo Search Agent for Agentverse...")
    
    if not check_api_key():
        sys.exit(1)
    
    install_dependencies()
    setup_agent()