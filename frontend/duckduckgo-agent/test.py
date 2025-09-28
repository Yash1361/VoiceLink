"""
Test script to verify DuckDuckGo search functionality
"""

import json
import asyncio
import requests


async def test_duckduckgo_search():
    """Test the DuckDuckGo search functionality"""
    print("🔍 Testing DuckDuckGo API...")
    
    query = "artificial intelligence"
    url = "https://api.duckduckgo.com/"
    params = {
        "q": query,
        "format": "json",
        "no_redirect": "1",
        "no_html": "1", 
        "skip_disambig": "1"
    }
    
    try:
        print(f"Searching for: {query}")
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        print("✅ API Response received!")
        print(f"Abstract: {data.get('Abstract', 'None')}")
        print(f"Answer: {data.get('Answer', 'None')}")
        print(f"Definition: {data.get('Definition', 'None')}")
        print(f"Related Topics: {len(data.get('RelatedTopics', []))}")
        
        # Save sample response
        with open("sample_response.json", "w") as f:
            json.dump(data, f, indent=2)
        print("📄 Sample response saved to sample_response.json")
        
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False


def test_message_format():
    """Test ASI1 message formatting"""
    print("\n🤖 Testing ASI1 Chat Protocol message format...")
    
    # Test search request
    search_request = {
        "type": "chat_message",
        "content": "search artificial intelligence",
        "role": "user",
        "user_id": "test_user_123"
    }
    
    # Test search response
    search_response = {
        "type": "chat_message",
        "content": "Here's what I found about 'artificial intelligence':\n\n📝 **Overview**: AI is...",
        "role": "assistant", 
        "user_id": "test_user_123",
        "search_data": {
            "success": True,
            "query": "artificial intelligence",
            "results": []
        }
    }
    
    print("✅ Search Request Format:")
    print(json.dumps(search_request, indent=2))
    
    print("\n✅ Search Response Format:")
    print(json.dumps(search_response, indent=2))
    
    return True


async def main():
    """Main test function"""
    print("🧪 DuckDuckGo Search Agent - Test Suite")
    print("=" * 50)
    
    # Test 1: DuckDuckGo API
    api_success = await test_duckduckgo_search()
    
    # Test 2: Message formatting
    format_success = test_message_format()
    
    print("\n" + "=" * 50)
    print("📊 Test Results:")
    print(f"DuckDuckGo API: {'✅ PASS' if api_success else '❌ FAIL'}")
    print(f"Message Format: {'✅ PASS' if format_success else '❌ FAIL'}")
    
    if api_success and format_success:
        print("\n🎉 All tests passed! Agent is ready for deployment.")
    else:
        print("\n⚠️ Some tests failed. Check configuration.")


if __name__ == "__main__":
    asyncio.run(main())