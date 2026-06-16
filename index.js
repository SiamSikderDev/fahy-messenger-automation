const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_token_123";

console.log(`Starting Facebook Messenger Webhook Server...`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET / - Home/Health Check
    if (path === "/" && req.method === "GET") {
      return new Response("Facebook Messenger Webhook Server is running!");
    }

    // GET /webhook - Verification
    if (path === "/webhook" && req.method === "GET") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");

      if (mode && token) {
        if (mode === "subscribe" && token === VERIFY_TOKEN) {
          console.log(`[Webhook] Verification successful!`);
          return new Response(challenge, { status: 200 });
        } else {
          console.warn(`[Webhook] Verification failed: Token mismatch or invalid mode.`);
          return new Response("Forbidden", { status: 403 });
        }
      }
      return new Response("Bad Request", { status: 400 });
    }

    // POST /webhook - Receive Messages
    if (path === "/webhook" && req.method === "POST") {
      try {
        const body = await req.json();

        // Check if this is an event from a page subscription
        if (body.object === "page") {
          console.log(`\n--- [Webhook Event Received] ---`);
          console.log(JSON.stringify(body, null, 2));

          // Iterate over each entry - there may be multiple if batched
          if (body.entry && Array.isArray(body.entry)) {
            body.entry.forEach((entry) => {
              if (entry.messaging && Array.isArray(entry.messaging)) {
                entry.messaging.forEach((webhookEvent) => {
                  const senderId = webhookEvent.sender?.id;
                  const recipientId = webhookEvent.recipient?.id;
                  const message = webhookEvent.message;

                  if (message) {
                    console.log(`Message Details:`);
                    console.log(`- Sender PSID: ${senderId}`);
                    console.log(`- Recipient Page ID: ${recipientId}`);
                    if (message.text) {
                      console.log(`- Text: "${message.text}"`);
                    }
                    if (message.attachments) {
                      console.log(`- Attachments: ${JSON.stringify(message.attachments)}`);
                    }
                  }
                });
              }
            });
          }
          console.log(`--------------------------------\n`);

          // Return HTTP 200 response to tell Facebook we received the event
          return new Response("EVENT_RECEIVED", { status: 200 });
        } else {
          // Return HTTP 404 if event is not from a page subscription
          return new Response("Not Found", { status: 404 });
        }
      } catch (err) {
        console.error(`[Error] Failed to parse request JSON:`, err.message);
        return new Response("Bad Request", { status: 400 });
      }
    }

    // Default 404 Route
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Server is listening on port ${PORT}`);
console.log(`Verification Token is set to: "${VERIFY_TOKEN}"`);
