import { AgentMailClient } from "agentmail";
import "dotenv/config";

// Initialize the AgentMail client
const client = new AgentMailClient({
  apiKey: process.env.AGENTMAIL_API_KEY || "",
});

// Store inbox info for reuse
let cachedInbox: any = null;

/**
 * Ensures an inbox exists and returns it
 */
async function ensureInbox() {
  if (!cachedInbox) {
    try {
      // Try to get existing inboxes first
      const allInboxes = await client.inboxes.list();
      
      if (allInboxes.count > 0 && allInboxes.inboxes && allInboxes.inboxes.length > 0) {
        cachedInbox = allInboxes.inboxes[0];
      } else {
        // Create a new inbox if none exist
        cachedInbox = await client.inboxes.create({
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
    
    await client.inboxes.messages.send(inbox.inboxId, {
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
    
    // Get all messages from the inbox
    const messagesResponse = await client.inboxes.messages.list(inbox.inboxId);
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
    const messagesResponse = await client.inboxes.messages.list(inbox.inboxId);
    const messages = messagesResponse.messages || [];
    console.log(`Retrieved ${messages.length} total emails`);
    return messages;
  } catch (error) {
    console.error("Error getting all emails:", error);
    throw new Error(`Failed to get all emails: ${error}`);
  }
}

// Export the client for advanced usage
export { client };