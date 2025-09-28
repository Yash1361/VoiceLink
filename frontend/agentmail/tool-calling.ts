import { send_email, get_relevant_emails, getAllEmails, getInbox } from './index.js';

// ASI:One API configuration - you can set these directly or use environment variables
let ASI_API_KEY = "";
let ASI_BASE_URL = "https://api.asi1.ai/v1";

// Try to get environment variables if available
try {
  // Check for environment variables in different ways
  if (typeof window !== 'undefined' && (window as any).process?.env) {
    ASI_API_KEY = (window as any).process.env.ASI_API_KEY || "";
  } else if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) {
    ASI_API_KEY = (globalThis as any).process.env.ASI_API_KEY || "";
  }
} catch (e) {
  console.log("Environment variables not available, please set ASI_API_KEY directly");
}

// Configuration function to set API key manually if needed
export function setApiKey(apiKey: string) {
  ASI_API_KEY = apiKey;
}

export function getApiKey(): string {
  return ASI_API_KEY;
}

// Tool definitions for ASI:One
export const TOOLS = [
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a specified recipient with subject, text content, and optional HTML content",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "The email subject line"
          },
          text: {
            type: "string", 
            description: "The plain text content of the email"
          },
          html: {
            type: "string",
            description: "Optional HTML content for the email. Leave empty string if not provided."
          },
          recipient: {
            type: "string",
            description: "The email address of the recipient"
          }
        },
        required: ["subject", "text", "recipient", "html"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "get_relevant_emails",
      description: "Search and retrieve emails that are relevant based on the provided search context or criteria",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description: "Search context, keywords, or criteria to filter relevant emails. Can be empty to get all emails."
          }
        },
        required: ["context"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_all_emails", 
      description: "Retrieve all emails from the inbox without any filtering",
      strict: true,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_inbox_info",
      description: "Get information about the current inbox including address and display name",
      strict: true,
      parameters: {
        type: "object", 
        properties: {},
        required: [],
        additionalProperties: false
      }
    }
  }
];

// Headers for ASI:One API requests
const getHeaders = () => ({
  "Authorization": `Bearer ${ASI_API_KEY}`,
  "Content-Type": "application/json"
});

/**
 * Execute a tool call based on the function name and arguments
 */
export async function executeToolCall(functionName: string, args: any): Promise<any> {
  try {
    switch (functionName) {
      case "send_email":
        await send_email(
          {
            subject: args.subject,
            text: args.text,
            html: args.html || undefined
          },
          args.recipient
        );
        return {
          success: true,
          message: `Email sent successfully to ${args.recipient}`,
          details: {
            recipient: args.recipient,
            subject: args.subject
          }
        };

      case "get_relevant_emails":
        const relevantEmails = await get_relevant_emails(args.context);
        return {
          success: true,
          count: relevantEmails.length,
          emails: relevantEmails.map(email => ({
            id: email.messageId,
            subject: email.subject,
            from: email.from,
            to: email.to,
            text: email.text?.substring(0, 200) + (email.text?.length > 200 ? '...' : ''), // Truncate for brevity
            receivedAt: email.receivedAt
          }))
        };

      case "get_all_emails":
        const allEmails = await getAllEmails();
        return {
          success: true,
          count: allEmails.length,
          emails: allEmails.map(email => ({
            id: email.messageId,
            subject: email.subject,
            from: email.from,
            to: email.to,
            text: email.text?.substring(0, 200) + (email.text?.length > 200 ? '...' : ''), // Truncate for brevity
            receivedAt: email.receivedAt
          }))
        };

      case "get_inbox_info":
        const inbox = await getInbox();
        return {
          success: true,
          inbox: {
            id: inbox.inboxId,
            email: inbox.email,
            displayName: inbox.displayName,
            username: inbox.username,
            domain: inbox.domain
          }
        };

      default:
        throw new Error(`Unknown function: ${functionName}`);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Main function to interact with ASI:One API using tool calling
 */
export async function chatWithTools(
  messages: any[], 
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    toolChoice?: string | object;
    parallelToolCalls?: boolean;
  } = {}
): Promise<any> {
  const {
    model = "asi1-mini",
    temperature = 0.7,
    maxTokens = 1024,
    toolChoice = "auto",
    parallelToolCalls = true
  } = options;

  try {
    // First API call to get tool calls
    const payload = {
      model,
      messages,
      tools: TOOLS,
      tool_choice: toolChoice,
      parallel_tool_calls: parallelToolCalls,
      temperature,
      max_tokens: maxTokens
    };

    console.log("Making initial request to ASI:One API...");
    const response = await fetch(`${ASI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`ASI:One API error: ${response.status} ${response.statusText}`);
    }

    const responseData = await response.json();
    console.log("Initial response received");

    // Check if there are tool calls
    const assistantMessage = responseData.choices[0].message;
    const toolCalls = assistantMessage.tool_calls || [];

    // Build message history
    const messagesHistory = [...messages, assistantMessage];

    if (toolCalls.length > 0) {
      console.log(`Processing ${toolCalls.length} tool call(s)...`);
      
      // Execute tool calls
      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);
        
        console.log(`Executing tool: ${functionName}`, args);
        const result = await executeToolCall(functionName, args);

        // Add tool result to message history
        const toolResultMessage = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        };
        
        messagesHistory.push(toolResultMessage);
      }

      // Make final call to get the response with tool results
      const finalPayload = {
        model,
        messages: messagesHistory,
        temperature,
        max_tokens: maxTokens
      };

      console.log("Making final request with tool results...");
      const finalResponse = await fetch(`${ASI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(finalPayload)
      });

      if (!finalResponse.ok) {
        throw new Error(`ASI:One API error in final call: ${finalResponse.status} ${finalResponse.statusText}`);
      }

      const finalData = await finalResponse.json();
      return {
        response: finalData,
        toolCalls,
        messagesHistory
      };
    } else {
      // No tool calls, return the original response
      return {
        response: responseData,
        toolCalls: [],
        messagesHistory
      };
    }

  } catch (error) {
    console.error("Error in chatWithTools:", error);
    throw error;
  }
}

/**
 * Convenience function for simple email assistant interactions
 */
export async function emailAssistant(userMessage: string): Promise<string> {
  const systemMessage = {
    role: "system",
    content: `You are an email assistant that can help users send emails and search through their inbox. 

Available tools:
- send_email: Send emails to recipients
- get_relevant_emails: Search emails by context/keywords  
- get_all_emails: Get all emails in inbox
- get_inbox_info: Get inbox information

When sending emails, make sure to ask for recipient, subject, and content if not provided.
When searching emails, use the context the user provides to find relevant messages.
Be helpful and concise in your responses.`
  };

  const messages = [systemMessage, { role: "user", content: userMessage }];
  
  const result = await chatWithTools(messages);
  return result.response.choices[0].message.content || "I apologize, but I couldn't process your request.";
}

// Export types for better TypeScript support
export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}