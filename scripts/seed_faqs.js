import mongoose from "mongoose";
import FAQ from "../models/FAQ.js";

const MONGODB_URI = process.env.MONGODB_URI;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!MONGODB_URI || !GEMINI_API_KEY) {
  console.error("Error: MONGODB_URI and GEMINI_API_KEY must be set in your environment variables / .env file.");
  process.exit(1);
}

const faqs = [
  {
    question: "What is Fahy?",
    answer: "Fahy is a leading AI automation agency. We specialize in building custom AI agents, workflow automations, web scraping pipelines, and API integrations to help businesses save time and scale efficiently."
  },
  {
    question: "What services does Fahy offer?",
    answer: "We offer custom AI agent development (like Facebook Messenger chatbots, lead-capture forms, data extractors), workflow automation (Zapier/Make setups), web scraping, API development, and cloud deployments."
  },
  {
    question: "How much do Fahy's services cost?",
    answer: "Our pricing is project-based and starts at $1,500. We also offer consulting and monthly maintenance packages starting at $500/month."
  },
  {
    question: "How can I get started or contact Fahy?",
    answer: "You can get started by expressing interest right here in this chat! I can collect your details to set up a discovery call. Alternatively, you can email us at contact@fahy.com."
  },
  {
    question: "What are Fahy's business hours?",
    answer: "We are open Monday through Friday, 9:00 AM to 6:00 PM EST. We are closed on weekends and major holidays."
  },
  {
    question: "Where is Fahy located?",
    answer: "Fahy operates as a fully remote global agency, with our core team based in New York City."
  }
];

async function generateEmbedding(text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text: text }] }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API failed: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.embedding?.values;
}

async function seed() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("Connected successfully.");

    console.log("Cleaning existing FAQs...");
    await FAQ.deleteMany({});
    console.log("Cleaned.");

    console.log("Generating embeddings and seeding FAQs...");
    for (const faq of faqs) {
      console.log(`- Generating embedding for: "${faq.question}"`);
      const embedding = await generateEmbedding(faq.question);
      
      const newFaq = new FAQ({
        question: faq.question,
        answer: faq.answer,
        embedding: embedding
      });
      await newFaq.save();
    }

    console.log("\nSeeding completed successfully! 🎉");
  } catch (error) {
    console.error("Seeding failed:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

seed();
