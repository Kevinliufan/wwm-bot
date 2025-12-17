const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");

// --- KEEP ALIVE ---
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("WWM Deep-Bot is Alive!"));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// --- CONFIGURATION ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Gemini with Google Search grounding
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  tools: [
    {
      googleSearch: {},
    },
  ],
});

const memoryCache = new Map();
let dailyAiCount = 0;
setInterval(() => {
  dailyAiCount = 0;
}, 86400000);

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!ask ")) {
    const userQuery = message.content.slice(5).trim();
    const cacheKey = userQuery.toLowerCase();

    // 1. CHECK CACHE
    if (memoryCache.has(cacheKey)) {
      await message.reply(memoryCache.get(cacheKey));
      return;
    }

    const processingMsg = await message.reply(
      `⚔️ *Searching the world for "${userQuery}"...*`
    );

    try {
      // Let Gemini search the web with Google Search grounding
      const prompt = `
        You are an expert guide for "Where Winds Meet" (燕云十六声) game.
        
        User Question: ${userQuery}
        
        Instructions:
        - Search the web for accurate information about this topic.
        - Provide a detailed summary (3-4 sentences).
        - If the question is in Chinese, answer in Chinese. If in English, answer in English.
        - Include specific stats, locations, or skills if available.
        - Use **Bold** for key terms.
        - If you found sources, mention them at the end.
      `;

      const result = await model.generateContent(prompt);
      const response = result.response;

      // Get the text response
      let aiText = response.text();

      // Extract clean source links (avoid HTML/CSS noise from grounding metadata)
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks?.length > 0) {
        const sources = groundingMetadata.groundingChunks
          .filter((chunk) => chunk.web?.uri)
          .slice(0, 2) // Max 2 sources
          .map((chunk) => chunk.web.uri);

        if (sources.length > 0) {
          aiText += `\n\n📚 **Sources:** ${sources
            .map((url) => `[Link](${url})`)
            .join(" • ")}`;
        }
      }

      // Discord has 2000 char limit for messages (4000 for embeds, but we're not using those)
      const MAX_LENGTH = 1900; // Leave buffer for formatting
      if (aiText.length > MAX_LENGTH) {
        aiText =
          aiText.substring(0, MAX_LENGTH) + "...\n\n*[Response truncated]*";
      }

      // 6. CACHE & REPLY
      dailyAiCount++;
      memoryCache.set(cacheKey, aiText);
      setTimeout(() => memoryCache.delete(cacheKey), 1000 * 60 * 60 * 24);

      await processingMsg.edit(aiText);
    } catch (error) {
      console.error("Error:", error);
      await processingMsg.edit(
        "⚠️ **Error.** The archives are unreadable right now."
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
