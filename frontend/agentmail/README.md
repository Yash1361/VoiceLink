# AgentMail API Wrapper

This module provides a simple wrapper around the AgentMail API for the VoiceLink project.

## Setup

1. Make sure you have your AgentMail API key in your `.env` file:
```
AGENTMAIL_API_KEY=your_api_key_here
```

2. Import the functions you need:
```typescript
import { send_email, get_relevant_emails } from "./agentmail";
```

## Functions

### `send_email(contents, dest)`

Sends an email using AgentMail.

**Parameters:**
- `contents` (object): Email content
  - `subject` (string): Email subject
  - `text` (string): Plain text content
  - `html` (string, optional): HTML content
- `dest` (string): Destination email address

**Example:**
```typescript
await send_email(
  {
    subject: "Hello World",
    text: "This is a test email",
    html: "<h1>Hello World</h1><p>This is a test email</p>"
  },
  "recipient@example.com"
);
```

### `get_relevant_emails(context)`

Retrieves emails that match the given context/search criteria.

**Parameters:**
- `context` (string): Search context to filter emails by

**Returns:** Promise<any[]> - Array of matching emails

**Example:**
```typescript
const emails = await get_relevant_emails("important meeting");
console.log(`Found ${emails.length} relevant emails`);
```

## Additional Functions

### `getAllEmails()`

Gets all emails from the inbox.

**Returns:** Promise<any[]> - Array of all emails

### `getInbox()`

Gets the current inbox information.

**Returns:** Promise<any> - Inbox object

## Quick Start

```typescript
import { send_email, get_relevant_emails } from "./agentmail";
import "dotenv/config";

async function main() {
  // Send an email
  await send_email(
    {
      subject: "Hello from VoiceLink!",
      text: "This is my first email sent with the VoiceLink AgentMail wrapper.",
      html: "<h1>Hello from VoiceLink!</h1><p>This is my first email sent with the VoiceLink AgentMail wrapper.</p>"
    },
    "kevskillz10@gmail.com"
  );

  // Get relevant emails
  const emails = await get_relevant_emails("hello");
  console.log("Relevant emails:", emails);
  
  // Get all emails
  const allEmails = await getAllEmails();
  console.log(`Total emails: ${allEmails.length}`);
}

main();
```

## Testing

Run the included test to verify everything works:

```typescript
import { testAgentMailAPI } from "./agentmail/test";

// Run the test
testAgentMailAPI();
```

## Error Handling

All functions include proper error handling and will throw descriptive errors if something goes wrong. Make sure to wrap your calls in try-catch blocks:

```typescript
try {
  await send_email(contents, destination);
} catch (error) {
  console.error("Failed to send email:", error.message);
}
```