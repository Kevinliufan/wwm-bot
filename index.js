const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai"); // AI Library
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

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!ask ")) {
    const userQuery = message.content.slice(5).trim();
    // Send a "Thinking..." message so the user knows we are working
    const processingMsg = await message.reply(
      `⚔️ *Consulting the archives about "${userQuery}"...*`
    );

    try {
      // 1. SEARCH GOOGLE (Wiki)
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.SEARCH_ENGINE_ID;
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(
        userQuery
      )}`;

      const searchResponse = await axios.get(searchUrl);
      const data = searchResponse.data;

      // Check if we found results
      if (!data.items || data.items.length === 0) {
        await processingMsg.edit(
          "I could not find any records of that in the wiki."
        );
        return;
      }

      // 2. PREPARE DATA FOR AI
      // We take the top 3 results to give the AI enough context
      const topResults = data.items
        .slice(0, 3)
        .map(
          (item) =>
            `Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`
        )
        .join("\n\n");

      // 3. ASK GEMINI
      const prompt = `
        You are a helpful guide for the game "Where Winds Meet".
        Answer the player's question based ONLY on the search results below.
        
        Rules:
        - Summarize the answer clearly.
        - If the answer isn't in the search results, admit you don't know.
        - Keep it brief (under 3 sentences).
        - Include the source link at the end.
        
        Player Question: ${userQuery}
        
        Search Results:
        ${topResults}
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const aiText = response.text();

      // 4. EDIT THE MESSAGE WITH THE AI ANSWER
      await processingMsg.edit(aiText);
    } catch (error) {
      console.error("Error:", error);
      // Fallback message if AI fails
      await processingMsg.edit(
        "⚠️ The spirits are silent (An error occurred). Check my logs."
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
