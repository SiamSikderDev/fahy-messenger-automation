import mongoose from "mongoose";
import Message from "./models/Message.js";
import Lead from "./models/Lead.js";
import FAQ from "./models/FAQ.js";
import ConversationState from "./models/ConversationState.js";


const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_secret_token_123";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_PSID = process.env.OWNER_PSID;


console.log(`Starting Facebook Messenger Webhook Server...`);

// Connect to MongoDB
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("[MongoDB] Connected successfully"))
    .catch((err) => console.error("[MongoDB] Connection error:", err.message));
} else {
  console.warn("[MongoDB] Warning: MONGODB_URI environment variable is not defined.");
}


// Helper function to get text embedding vector from Gemini API
async function getEmbedding(text) {
  if (!GEMINI_API_KEY) {
    console.error("[Embedding API] Error: GEMINI_API_KEY is not configured.");
    return null;
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: text }] },
        }),
      }
    );

    const data = await response.json();
    if (response.ok) {
      return data.embedding?.values || null;
    }
    console.error("[Embedding API] Failed to get embedding:", JSON.stringify(data));
  } catch (error) {
    console.error("[Embedding API] Network error:", error.message);
  }
  return null;
}

// Cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Retrieve relevant FAQ context
async function retrieveContext(userText) {
  const queryEmbedding = await getEmbedding(userText);
  if (!queryEmbedding) return "";

  try {
    const faqs = await FAQ.find({});
    if (faqs.length === 0) return "";

    const scoredFaqs = faqs.map((faq) => {
      const score = cosineSimilarity(queryEmbedding, faq.embedding);
      return { question: faq.question, answer: faq.answer, score };
    });

    // Sort by score descending and filter by a minimum threshold (e.g. 0.6)
    scoredFaqs.sort((a, b) => b.score - a.score);
    const relevantFaqs = scoredFaqs.filter((f) => f.score > 0.6).slice(0, 3);

    if (relevantFaqs.length === 0) return "";

    let context = "Relevant Company FAQs:\n";
    relevantFaqs.forEach((f) => {
      context += `- Question: ${f.question}\n  Answer: ${f.answer}\n`;
    });
    return context;
  } catch (err) {
    console.error("[RAG] Error retrieving context:", err.message);
  }
  return "";
}

// Helper function to get response from Gemini API with system instructions and RAG context
async function getGeminiResponse(userText, contextText = "") {
  if (!GEMINI_API_KEY) {
    console.error("[Gemini API] Error: GEMINI_API_KEY is not configured.");
    return "Sorry, my brain is not configured right now.";
  }

  const systemPrompt = `You are an AI assistant for Fahy. Use the following context to help answer the user's questions if relevant. If the context does not contain the answer, answer politely using your general knowledge about business and professional communication.

Context:
${contextText || "No additional company FAQs found."}

If you have low confidence, if the question is out of scope of professional business communication, if the user asks complex or sensitive questions, or if you cannot answer the query with certainty, answer politely and MUST append '[HUMAN_HANDOFF]' at the very end of your response.

If the user expresses interest in booking a service, hiring us, or asks about pricing, package options, or wants to get started, answer politely to acknowledge, and MUST append '[START_LEAD_CAPTURE]' at the very end of your response. Otherwise, answer their questions normally without appending the tag.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userText }] }],
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          }
        }),
      }
    );

    const data = await response.json();
    if (response.ok) {
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (reply) {
        return reply.trim();
      }
    }
    console.error("[Gemini API] Failed to generate content:", JSON.stringify(data));
  } catch (error) {
    console.error("[Gemini API] Network error:", error.message);
  }
  return "Sorry, I encountered an error while thinking.";
}


// Helper function to send replies via the Facebook Send API
async function sendTextMessage(recipientId, text) {
  if (!PAGE_ACCESS_TOKEN) {
    console.error("[Send API] Error: PAGE_ACCESS_TOKEN is not configured.");
    return;
  }

  const payload = {
    recipient: { id: recipientId },
    message: { text: text },
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );

    const data = await response.json();
    if (response.ok) {
      console.log(`[Send API] Message sent successfully to ${recipientId}: "${text}"`);
    } else {
      console.error(`[Send API] Failed to send message:`, JSON.stringify(data));
    }
  } catch (error) {
    console.error("[Send API] Network error:", error.message);
  }
}


// Helper function to handle the lead capture questionnaire states
async function handleLeadCaptureFlow(senderId, text, lead) {
  if (lead.status === "collecting_name") {
    lead.name = text.trim();
    lead.status = "collecting_phone";
    await lead.save();
    await sendTextMessage(senderId, `Thank you, ${lead.name}! What is your phone number?`);
    return;
  }

  if (lead.status === "collecting_phone") {
    lead.phone = text.trim();
    lead.status = "collecting_email";
    await lead.save();
    await sendTextMessage(senderId, "Got it! And what is your email address?");
    return;
  }

  if (lead.status === "collecting_email") {
    lead.email = text.trim();
    lead.status = "completed";
    await lead.save();
    
    await sendTextMessage(senderId, "Thank you! I have saved your details. Our team will get in touch with you shortly.");

    // Notify the page owner
    const ownerId = process.env.OWNER_PSID;
    const notificationText = `🔔 [New Lead Alert]!\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${lead.email}\nConversation: https://business.facebook.com/latest/inbox/people/${lead.senderId}`;
    
    if (ownerId && ownerId !== "your_facebook_user_psid_here" && senderId !== ownerId) {
      console.log(`[Lead Capture] Notifying owner (${ownerId}) of new lead...`);
      await sendTextMessage(ownerId, notificationText);
    } else {
      console.log(`[Lead Capture] New Lead captured but OWNER_PSID not configured to send Messenger alert.`);
      console.log(notificationText);
    }
    return;
  }
}


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
            for (const entry of body.entry) {
              if (entry.messaging && Array.isArray(entry.messaging)) {
                for (const webhookEvent of entry.messaging) {
                  const senderId = webhookEvent.sender?.id;
                  const recipientId = webhookEvent.recipient?.id;
                  const message = webhookEvent.message;

                  if (message) {
                    console.log(`Message Details:`);
                    console.log(`- Sender PSID: ${senderId}`);
                    console.log(`- Recipient Page ID: ${recipientId}`);

                    // Ignore echo messages (sent by the bot itself) to prevent infinite loops
                    if (message.is_echo) {
                      console.log(`- Ignoring echo message.`);
                      continue;
                    }

                    if (message.text) {
                      console.log(`- Text: "${message.text}"`);

                      const textLower = message.text.trim().toLowerCase();

                      // 1. Resume automation if `/bot` command
                      if (textLower === "/bot") {
                        await ConversationState.findOneAndUpdate(
                          { senderId: senderId },
                          { isHandedOver: false, updatedAt: new Date() },
                          { upsert: true, new: true }
                        );
                        console.log(`[Handoff] Automation resumed for user ${senderId}`);
                        await sendTextMessage(senderId, "🤖 Automation resumed. How can I help you today?");
                        continue;
                      }

                      // 2. Fetch ConversationState
                      let state = await ConversationState.findOne({ senderId: senderId });

                      // If already handed over, do not respond automatically
                      if (state && state.isHandedOver) {
                        console.log(`[Handoff] Conversation is in handed-over state. Ignoring message: "${message.text}"`);
                        continue;
                      }

                      // 3. Check for explicit handoff keywords
                      const handoffKeywords = ["human", "agent", "support"];
                      const needsHandoff = handoffKeywords.some(keyword => textLower.includes(keyword));

                      if (needsHandoff) {
                        await ConversationState.findOneAndUpdate(
                          { senderId: senderId },
                          { isHandedOver: true, updatedAt: new Date() },
                          { upsert: true, new: true }
                        );
                        console.log(`[Handoff] User requested human. Conversation handed over for ${senderId}`);
                        
                        await sendTextMessage(senderId, "I am handing you over to a human agent. They will get back to you shortly.");
                        
                        // Notify owner (only if owner is not the one chatting)
                        if (OWNER_PSID && OWNER_PSID !== "your_facebook_user_psid_here" && senderId !== OWNER_PSID) {
                          await sendTextMessage(OWNER_PSID, `⚠️ [Handoff Requested] User requested a human agent.\nConversation: https://business.facebook.com/latest/inbox/people/${senderId}\nMessage: "${message.text}"`);
                        }
                        continue;
                      }

                      // 4. Handle lead capture state machine checking
                      try {
                        const activeLead = await Lead.findOne({ senderId: senderId, status: { $ne: "completed" } });
                        if (activeLead) {
                          await handleLeadCaptureFlow(senderId, message.text, activeLead);
                          continue;
                        }
                      } catch (dbErr) {
                        console.error(`[MongoDB] Error querying active lead:`, dbErr.message);
                      }

                      // 5. Retrieve context and then query Gemini API
                      try {
                        const contextText = await retrieveContext(message.text);
                        let aiReply = await getGeminiResponse(message.text, contextText);

                        let finalReply = aiReply;
                        let triggerLeadCapture = false;
                        let triggerHandoff = false;

                        // Check for HUMAN_HANDOFF tag
                        if (aiReply.includes("[HUMAN_HANDOFF]")) {
                          finalReply = aiReply.replace("[HUMAN_HANDOFF]", "").trim();
                          triggerHandoff = true;
                        }

                        if (aiReply.includes("[START_LEAD_CAPTURE]")) {
                          finalReply = aiReply.replace("[START_LEAD_CAPTURE]", "").trim();
                          triggerLeadCapture = true;
                        }

                        // Send response to the user via Messenger
                        if (finalReply) {
                          await sendTextMessage(senderId, finalReply);
                        }

                        // Save the conversation details to MongoDB
                        try {
                          const conversationLog = new Message({
                            senderId: senderId,
                            userMessage: message.text,
                            aiResponse: finalReply,
                          });
                          await conversationLog.save();
                          console.log(`[MongoDB] Saved message log for user ${senderId}`);
                        } catch (dbErr) {
                          console.error(`[MongoDB] Error saving message log:`, dbErr.message);
                        }

                        // Handle state updates
                        if (triggerHandoff) {
                          await ConversationState.findOneAndUpdate(
                            { senderId: senderId },
                            { isHandedOver: true, updatedAt: new Date() },
                            { upsert: true, new: true }
                          );
                          console.log(`[Handoff] Gemini triggered low-confidence handoff for user ${senderId}`);
                          
                          // Notify owner (only if owner is not the one chatting)
                          if (OWNER_PSID && OWNER_PSID !== "your_facebook_user_psid_here" && senderId !== OWNER_PSID) {
                            await sendTextMessage(OWNER_PSID, `⚠️ [Handoff Requested] Gemini requested a human agent due to low confidence.\nConversation: https://business.facebook.com/latest/inbox/people/${senderId}\nUser message: "${message.text}"`);
                          }
                        } else if (triggerLeadCapture) {
                          try {
                            const newLead = new Lead({
                              senderId: senderId,
                              status: "collecting_name",
                            });
                            await newLead.save();
                            
                            // Send the first prompt
                            await sendTextMessage(senderId, "To get started, could you please tell me your full name?");
                            console.log(`[Lead Capture] Initiated lead flow for user ${senderId}`);
                          } catch (leadErr) {
                            console.error(`[Lead Capture] Error initiating lead:`, leadErr.message);
                          }
                        }
                      } catch (ragErr) {
                        console.error(`[RAG] Retrieval failed:`, ragErr.message);
                      }
                    }

                    if (message.attachments) {
                      console.log(`- Attachments: ${JSON.stringify(message.attachments)}`);
                    }
                  }
                }
              }
            }
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
