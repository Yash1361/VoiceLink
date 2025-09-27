import { send_email, get_relevant_emails, getAllEmails, getInbox } from "./index.js";

async function example() {
  try {
    // Get inbox info
    console.log("Getting inbox information...");
    const inbox = await getInbox();
    console.log("Inbox:", inbox);

    // Send an email
    console.log("Sending email...");
    await send_email(
      {
        subject: "Test Email from VoiceLink",
        text: "This is a test email sent using the VoiceLink AgentMail API wrapper.",
        html: "<h1>Test Email</h1><p>This is a test email sent using the VoiceLink AgentMail API wrapper.</p>"
      },
      "test@example.com"
    );
    console.log("Email sent successfully!");

    // Wait a moment for the email to be processed
    setTimeout(async () => {
      // Get all emails
      console.log("Getting all emails...");
      const allEmails = await getAllEmails();
      console.log(`Total emails: ${allEmails.length}`);

      // Get relevant emails based on context
      console.log("Getting relevant emails...");
      const relevantEmails = await get_relevant_emails("test");
      console.log(`Relevant emails found: ${relevantEmails.length}`);
      
      if (relevantEmails.length > 0) {
        console.log("First relevant email:", relevantEmails[0]);
      }
    }, 2000);

  } catch (error) {
    console.error("Example failed:", error);
  }
}

// Uncomment the line below to run the example
// example();

export { example };