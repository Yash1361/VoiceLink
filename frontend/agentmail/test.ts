import { send_email, get_relevant_emails, getAllEmails, getInbox } from "./index.js";
import "dotenv/config";

/**
 * Simple test function to verify the AgentMail API wrapper
 */
async function testAgentMailAPI() {
  console.log("🚀 Starting AgentMail API tests...\n");

  try {
    // Test 1: Get inbox information
    console.log("📬 Test 1: Getting inbox information...");
    const inbox = await getInbox();
    console.log(`✅ Inbox created/retrieved: ${inbox.inboxId}`);
    console.log(`📧 Email address: ${inbox.inboxId}\n`);

    // Test 2: Send a test email
    console.log("📤 Test 2: Sending test email...");
    await send_email(
      {
        subject: "VoiceLink API Test",
        text: "This is a test email from the VoiceLink AgentMail API wrapper.",
        html: "<h1>VoiceLink API Test</h1><p>This is a test email from the VoiceLink AgentMail API wrapper.</p><p><strong>Status:</strong> Working correctly! ✅</p>"
      },
      "kevskillz10@gmail.com" // Using your real email from README
    );
    console.log("✅ Test email sent successfully!\n");

    // Test 3: Wait a moment then get all emails
    console.log("⏳ Waiting 3 seconds for email processing...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("📥 Test 3: Getting all emails...");
    const allEmails = await getAllEmails();
    console.log(`✅ Retrieved ${allEmails.length} total emails\n`);

    // Test 4: Get relevant emails based on context
    console.log("🔍 Test 4: Searching for relevant emails...");
    const relevantEmails = await get_relevant_emails("test");
    console.log(`✅ Found ${relevantEmails.length} emails matching 'test'`);
    
    if (relevantEmails.length > 0) {
      console.log("📝 First relevant email preview:");
      console.log(`   Subject: ${relevantEmails[0].subject}`);
      console.log(`   From: ${relevantEmails[0].from}`);
      console.log(`   Date: ${relevantEmails[0].created_at}\n`);
    }

    // Test 5: Search for specific context
    console.log("🔍 Test 5: Searching for 'VoiceLink' emails...");
    const voicelinkEmails = await get_relevant_emails("VoiceLink");
    console.log(`✅ Found ${voicelinkEmails.length} emails matching 'VoiceLink'\n`);

    console.log("🎉 All tests completed successfully!");
    console.log("📋 Summary:");
    console.log(`   - Inbox: ${inbox.inboxId}`);
    console.log(`   - Total emails: ${allEmails.length}`);
    console.log(`   - Test-related emails: ${relevantEmails.length}`);
    console.log(`   - VoiceLink-related emails: ${voicelinkEmails.length}`);

  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error("💡 Make sure your AGENTMAIL_API_KEY is set in the .env file");
  }
}

// Export the test function
export { testAgentMailAPI };

// Uncomment the line below to run the tests
// testAgentMailAPI();