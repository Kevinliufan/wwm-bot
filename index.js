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
      // STEP 1: Use Gemini's Google Search to find the best URL
      const searchPrompt = `Find the best wiki or guide page about "${userQuery}" for the game "Where Winds Meet" (燕云十六声). Return ONLY the URL, nothing else.`;

      const searchResult = await model.generateContent(searchPrompt);
      const searchResponse = searchResult.response;

      // Extract URL from grounding metadata
      let bestUrl = null;
      const groundingMetadata =
        searchResponse.candidates?.[0]?.groundingMetadata;
      if (groundingMetadata?.groundingChunks?.length > 0) {
        const firstChunk = groundingMetadata.groundingChunks.find(
          (chunk) => chunk.web?.uri
        );
        bestUrl = firstChunk?.web?.uri;
      }

      // Fallback: extract URL from text if metadata missing
      if (!bestUrl) {
        const urlMatch = searchResponse.text().match(/https?:\/\/[^\s]+/);
        bestUrl = urlMatch ? urlMatch[0] : null;
      }

      let fullPageText = "";
      let sourceUrl = bestUrl || "search results";

      // STEP 2: If we have a URL, fetch clean text using Jina AI Reader
      if (bestUrl) {
        console.log(`Reading page: ${bestUrl}`);
        const jinaUrl = `https://r.jina.ai/${bestUrl}`;

        try {
          const pageResponse = await axios.get(jinaUrl, {
            timeout: 15000,
            headers: {
              Accept: "text/plain",
              "X-Return-Format": "text",
            },
          });
          fullPageText = pageResponse.data;

          // Trim to max 50k chars to save tokens
          if (fullPageText.length > 50000) {
            fullPageText =
              fullPageText.substring(0, 50000) + "\n[Content trimmed...]";
          }
        } catch (readError) {
          console.error("Could not read page:", readError.message);
          fullPageText = "Could not fetch page content.";
        }
      }

      // STEP 3: Ask Gemini to summarize the page content
      const prompt = `
        You are an expert guide for "Where Winds Meet" (燕云十六声) game.
        
        User Question: ${userQuery}
        
        ${
          fullPageText
            ? `Page Content:\n${fullPageText}`
            : "Search and answer based on your knowledge."
        }
        
        Instructions:
        - Provide a concise summary (2-3 sentences max).
        - If the question is in Chinese, answer in Chinese. If in English, answer in English.
        - Include specific stats, locations, or skills if available.
        - Use **Bold** for key terms.
        - Keep it under 1500 characters.
      `;

      const result = await model.generateContent(prompt);
      let aiText = result.response.text();

      // Add source link
      if (bestUrl) {
        aiText += `\n\n📚 [Read More](${bestUrl})`;
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
