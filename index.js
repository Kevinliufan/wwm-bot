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

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Sticking to 1.5 Flash because it has a huge context window (can read whole pages)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

    // 2. CHECK LIMITS
    if (dailyAiCount >= 50) {
      // Safety brake for free tier
      await message.reply("🛑 Daily limit reached.");
      return;
    }

    const processingMsg = await message.reply(
      `⚔️ *Traveling to the archives to read about "${userQuery}"...*`
    );

    try {
      // 3. SEARCH GOOGLE (To get the best link)
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.SEARCH_ENGINE_ID;
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(
        userQuery
      )}`;

      const searchResponse = await axios.get(searchUrl);
      const data = searchResponse.data;

      if (!data.items || data.items.length === 0) {
        await processingMsg.edit("🚫 **No results found.**");
        return;
      }

      const bestResult = data.items[0]; // Take the #1 result
      const bestLink = bestResult.link;

      // 4. DEEP READ (Fetch the full page content)
      // We use r.jina.ai to convert the website URL into clean text for the AI
      console.log(`Reading page: ${bestLink}`);
      const jinaUrl = `https://r.jina.ai/${bestLink}`;

      let fullPageText = "";
      try {
        const pageResponse = await axios.get(jinaUrl);
        fullPageText = pageResponse.data;
      } catch (readError) {
        console.error("Could not read page, falling back to snippet.");
        fullPageText = bestResult.snippet; // Fallback if reading fails
      }

      // 5. ASK GEMINI (With the FULL context)
      // We truncate the text to 8000 characters to keep it fast and safe
      const safeText = fullPageText.substring(0, 8000);

      const prompt = `
        You are an expert guide for "Where Winds Meet".
        
        I have provided the full text of a wiki page below. 
        Your job is to answer the User Question using ONLY that text.
        
        User Question: ${userQuery}
        
        --- WIKI PAGE CONTENT ---
        ${safeText}
        -------------------------
        
        Instructions:
        - Provide a detailed summary (3-4 sentences).
        - Include specific stats, locations, or skills mentioned in the text.
        - Use **Bold** for key terms.
        - Ends with: [Read Source](${bestLink})
      `;

      const result = await model.generateContent(prompt);
      const aiText = result.response.text();

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
