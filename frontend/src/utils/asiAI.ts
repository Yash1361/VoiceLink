import { v4 as uuidv4 } from 'uuid';

// ASI AI Configuration
const API_KEY = import.meta.env.VITE_ASI_API_KEY || "";
const ENDPOINT = "https://api.asi1.ai/v1/chat/completions";
const MODEL = "asi1-mini";
const AGENT_ADDRESS = "agent1qvzuryaayn6ah0ss0nsstvjy3jkutsjcrfcmqdnp6n26akz0c89e775hcat";

// Session management
const sessionMap = new Map<string, string>();

function getSessionId(convId: string): string {
  let sessionId = sessionMap.get(convId);
  if (!sessionId) {
    sessionId = uuidv4();
    sessionMap.set(convId, sessionId);
  }
  return sessionId;
}

export async function ask(convId: string, messages: any[], stream = false): Promise<string> {
  console.log('[debug] Original messages:', messages);
  
  // Add Amazon search instruction to every user message
  const modifiedMessages = messages.map((message) => {
    if (message.role === 'user') {
      return {
        ...message,
        content: `search for ${message.content} on amazon`
      };
    }
    return message;
  });
  
  console.log('[debug] Modified messages:', modifiedMessages);
  console.log(`[debug] Using agent address: ${AGENT_ADDRESS}`);
  
  const response = await fetch("https://api.asi1.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      "messages": modifiedMessages,
      "model": "asi1-mini",
      "agent_address": "agent1qvzuryaayn6ah0ss0nsstvjy3jkutsjcrfcmqdnp6n26akz0c89e775hcat",
      "web_search": true
    }),
  });

  console.log('[debug] Response status:', response.status);
  console.log('[debug] Response ok:', response.ok);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[debug] Error response:', errorText);
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const body = await response.json();
  console.log('[debug] Full response body:', body);
  
  if (!body.choices || body.choices.length === 0) {
    return "❌ No choices in response";
  }
  
  const choice = body.choices[0];
  if (!choice.message) {
    return "❌ No message in response choice";
  }
  
  const content = choice.message.content;
  if (!content || content.trim() === '') {
    if (body.error) {
      return `❌ API Error: ${body.error.message || body.error}`;
    }
    return "⚠️ Agent returned empty content";
  }
  
  return content;
}

// Usage example function
export async function exampleUsage() {
  const convId = uuidv4();
  const messages = [
    { 
      role: 'user', 
      content: 'use Hi-dream model to generate image of monkey sitting on top of mountain' 
    }
  ];
  
  const reply = await ask(convId, messages, true);
  console.log(`Assistant: ${reply}`);
  return reply;
}

export const AGENT_ID = "@agent1qvzuryaayn6ah0ss0nsstvjy3jkutsjcrfcmqdnp6n26akz0c89e775hcat";