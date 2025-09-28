import { AgentMailClient } from "agentmail";

const isNodeRuntime = typeof process !== "undefined" && !!process.versions?.node;

let client: AgentMailClient | null = null;
let clientPromise: Promise<AgentMailClient> | null = null;
let cachedInbox: any = null;
let overrideApiKey: string | null = null;
let loadDotenvPromise: Promise<void> | null = null;

function loadDotenvIfNeeded(): Promise<void> {
  if (!isNodeRuntime) {
    return Promise.resolve();
  }

  if (!loadDotenvPromise) {
    loadDotenvPromise = import("dotenv")
      .then((module) => {
        module.config();
      })
      .catch((error) => {
        console.warn("Dotenv configuration failed:", error);
      });
  }

  return loadDotenvPromise;
}

function resolveApiKey(): string {
  if (overrideApiKey) {
    return overrideApiKey;
  }

  const globalProcess =
    typeof process !== "undefined"
      ? process
      : typeof globalThis !== "undefined"
        ? (globalThis as any).process
        : undefined;

  const importMetaEnv = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined;
  const browserGlobals = typeof window !== "undefined" ? (window as any) : undefined;

  const candidates = [
    globalProcess?.env?.AGENTMAIL_API_KEY,
    globalProcess?.env?.VITE_AGENTMAIL_API_KEY,
    browserGlobals?.AGENTMAIL_API_KEY,
    browserGlobals?.VITE_AGENTMAIL_API_KEY,
    importMetaEnv?.AGENTMAIL_API_KEY,
    importMetaEnv?.VITE_AGENTMAIL_API_KEY,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

async function getClient(): Promise<AgentMailClient> {
  if (client) {
    return client;
  }

  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    await loadDotenvIfNeeded();

    const apiKey = resolveApiKey();
    if (!apiKey) {
      throw new Error("AGENTMAIL_API_KEY is not configured");
    }

    client = new AgentMailClient({
      apiKey,
    });
    return client;
  })();

  try {
    return await clientPromise;
  } finally {
    clientPromise = null;
  }
}

export function configureAgentMailClient(apiKey: string) {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    throw new Error("Attempted to configure AgentMail client with an empty API key");
  }

  overrideApiKey = trimmed;
  client = new AgentMailClient({
    apiKey: trimmed,
  });
  clientPromise = null;
  cachedInbox = null;
}

/**
 * Ensures an inbox exists and returns it
 */
async function ensureInbox() {
  const agentMailClient = await getClient();

  if (!cachedInbox) {
    try {
      // Try to get existing inboxes first
      const allInboxes = await agentMailClient.inboxes.list();
      
      if (allInboxes.count > 0 && allInboxes.inboxes && allInboxes.inboxes.length > 0) {
        cachedInbox = allInboxes.inboxes[0];
      } else {
        // Create a new inbox if none exist
        cachedInbox = await agentMailClient.inboxes.create({
          username: "voicelink-app",
          domain: "agentmail.to", // Use default domain
          displayName: "VoiceLink App",
        });
      }
    } catch (error) {
      console.error("Error managing inbox:", error);
      throw new Error("Failed to initialize inbox");
    }
  }
  return cachedInbox;
}

/**
 * Sends an email using AgentMail
 * @param contents - The email content object containing subject, text, and optional html
 * @param dest - The destination email address
 * @returns Promise<void>
 */
export async function send_email(
  contents: {
    subject: string;
    text: string;
    html?: string;
  },
  dest: string
): Promise<void> {
  try {
    const inbox = await ensureInbox();
    const agentMailClient = await getClient();

    await agentMailClient.inboxes.messages.send(inbox.inboxId, {
      to: dest,
      subject: contents.subject,
      text: contents.text,
      ...(contents.html && { html: contents.html }),
    });
    
    console.log(`Email sent successfully to ${dest}`);
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error(`Failed to send email to ${dest}: ${error}`);
  }
}

/**
 * Gets relevant emails based on context/search criteria
 * @param context - Search context or criteria to filter emails
 * @returns Promise<any[]> - Array of relevant emails
 */
export async function get_relevant_emails(context: string): Promise<any[]> {
  try {
    const inbox = await ensureInbox();
    const agentMailClient = await getClient();
    
    // Get all messages from the inbox
    const messagesResponse = await agentMailClient.inboxes.messages.list(inbox.inboxId);
    const messages = messagesResponse.messages || [];
    
    if (!context || context.trim() === "") {
      // If no context provided, return all messages
      return messages;
    }
    
    // Filter messages based on context (case-insensitive search in subject and content)
    const contextLower = context.toLowerCase();
    const relevantEmails = messages.filter((message: any) => {
      const subject = (message.subject || "").toLowerCase();
      const textContent = (message.text || "").toLowerCase();
      const htmlContent = (message.html || "").toLowerCase();
      
      return (
        subject.includes(contextLower) ||
        textContent.includes(contextLower) ||
        htmlContent.includes(contextLower)
      );
    });
    
    console.log(`Found ${relevantEmails.length} relevant emails for context: "${context}"`);
    return relevantEmails;
  } catch (error) {
    console.error("Error getting relevant emails:", error);
    throw new Error(`Failed to get relevant emails: ${error}`);
  }
}

/**
 * Gets the current inbox information
 * @returns Promise<any> - The current inbox object
 */
export async function getInbox() {
  return await ensureInbox();
}

/**
 * Lists all messages in the current inbox
 * @returns Promise<any[]> - Array of all messages
 */
export async function getAllEmails(): Promise<any[]> {
  try {
    const inbox = await ensureInbox();
    const agentMailClient = await getClient();
    const messagesResponse = await agentMailClient.inboxes.messages.list(inbox.inboxId);
    const messages = messagesResponse.messages || [];
    console.log(`Retrieved ${messages.length} total emails`);
    return messages;
  } catch (error) {
    console.error("Error getting all emails:", error);
    throw new Error(`Failed to get all emails: ${error}`);
  }
}

// Export helpers for advanced usage
export { getClient };
