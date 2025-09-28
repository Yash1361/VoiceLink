#!/usr/bin/env node

/**
 * Interactive LLM Chat - Test all email tool calls
 */

import "dotenv/config";
import { setApiKey, chatWithTools, TOOLS } from './tool-calling.js';
import { createInterface } from 'readline';

const asiApiKey = process.env.ASI_API_KEY;
const agentMailApiKey = process.env.AGENTMAIL_API_KEY;

if (!asiApiKey) {
  console.error("❌ Missing ASI_API_KEY in .env file");
  process.exit(1);
}

if (!agentMailApiKey) {
  console.error("❌ Missing AGENTMAIL_API_KEY in .env file");
  process.exit(1);
}

setApiKey(asiApiKey);

console.log("� Interactive Email Assistant with ASI:One LLM");
console.log("================================================");
console.log("\nAvailable tools:");
TOOLS.forEach((tool, index) => {
  console.log(`${index + 1}. ${tool.function.name} - ${tool.function.description}`);
});

console.log("\n💡 Try asking:");
console.log("• 'What's my email address?'");
console.log("• 'Send an email to test@example.com saying hello'");
console.log("• 'Do I have any emails about meetings?'");
console.log("• 'Show me all my emails'");
console.log("• 'Get my inbox information'");
console.log("\nType 'exit' to quit\n");

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
});

const messages = [
//   {
//     role: "system",
//     content: "You are an email assistant. Help users manage their emails using the available tools. Be helpful and use the appropriate tools based on user requests."
//   }
];

async function chat() {
  rl.question("You: ", async (userInput) => {
    if (userInput.toLowerCase().trim() === 'exit') {
      console.log("👋 Goodbye!");
      rl.close();
      return;
    }

    if (!userInput.trim()) {
      chat();
      return;
    }

    // Add user message to history
    messages.push({ role: "user", content: userInput });

    try {
      console.log("\n🤔 Thinking...");
      
      const result = await chatWithTools(messages, {
        model: "asi1-mini",
        temperature: 0.7,
        toolChoice: "auto"
      });

      const assistantMessage = result.response.choices[0].message;
      
      // Add assistant response to history
      messages.push(assistantMessage);

      // Show tool calls if any
      if (result.toolCalls.length > 0) {
        console.log("🔧 Tools used:");
        result.toolCalls.forEach((call: any, index: number) => {
          console.log(`   ${index + 1}. ${call.function.name}`);
        });
        console.log();
      }

      // Show final response
      console.log("🤖 Assistant:", assistantMessage.content || "(Used tools to help you)");
      console.log();

    } catch (error) {
      console.error("❌ Error:", error instanceof Error ? error.message : String(error));
      console.log();
    }

    // Continue chat
    chat();
  });
}

console.log("🚀 Starting interactive chat...\n");
chat();