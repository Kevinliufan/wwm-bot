const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const express = require("express");

// --- KEEP ALIVE SERVER ---
const app = express();
const port = process.env.PORT || 3000;
app.get("/", (req, res) => res.send("WWM AI-Bot is Alive!"));
app.listen(port, () => console.log(`Web server listening on port ${port}`));

// --- CONFIGURATION ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Cache memory
const memoryCache = new Map();

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
      `⚔️ *Consulting the archives about "${userQuery}"...*`
    );

    try {
      // 2. SEARCH GOOGLE
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.SEARCH_ENGINE_ID;
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(
        userQuery
      )}`;

      const searchResponse = await axios.get(searchUrl);
      const data = searchResponse.data;

      if (!data.items || data.items.length === 0) {
        await processingMsg.edit(
          "🚫 **No results found.** The scrolls contain no knowledge of this."
        );
        return;
      }

      // 3. PREPARE DATA
      const topResults = data.items
        .slice(0, 3)
        .map(
          (item) =>
            `Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`
        )
        .join("\n\n");

      // 4. ASK GEMINI (With Markdown Instructions)
      const prompt = `
        You are a guide for "Where Winds Meet".
        Question: ${userQuery}
        Search Results: ${topResults}
        
        Instructions:
        - Summarize the answer in 2-3 sentences.
        - USE DISCORD MARKDOWN:
          - Use **Bold** for item names or key terms.
          - Use *Italics* for lore or flavor text.
        - Ignore the Fextralife "Nov 13, 2025" dates.
        - End with a citation link formatted like this: [Read Source](URL)
      `;

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();

      // 5. CACHE AND REPLY
      memoryCache.set(cacheKey, aiText);
      setTimeout(() => memoryCache.delete(cacheKey), 1000 * 60 * 60 * 24);

      await processingMsg.edit(aiText);
    } catch (error) {
      console.error("Error:", error);
      if (error.response && error.response.status === 403) {
        await processingMsg.edit(
          "🛑 **Configuration Error.** Please check Render logs for API Key issues."
        );
      } else {
        await processingMsg.edit(
          "⚠️ **Error.** The spirits are silent right now."
        );
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
