const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios"); // New library for Google
const express = require("express");

// --- KEEP ALIVE SERVER ---
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("WWM Google-Bot is Alive!");
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// --- BOT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith("!ask ")) {
    const query = message.content.slice(5).trim();
    const processingMsg = await message.reply(
      `🔍 Searching the Wiki for: **${query}**...`
    );

    try {
      // GOOGLE CUSTOM SEARCH API REQUEST
      // We use the keys from Environment Variables
      const apiKey = process.env.GOOGLE_API_KEY;
      const cx = process.env.SEARCH_ENGINE_ID;

      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(
        query
      )}`;

      const response = await axios.get(url);
      const data = response.data;

      if (data.items && data.items.length > 0) {
        const firstResult = data.items[0];

        // Prepare the answer
        const snippet = firstResult.snippet.replace(/\n/g, " "); // Clean up newlines
        const title = firstResult.title;
        const link = firstResult.link;

        await processingMsg.edit(
          `**${title}**\n${snippet}\n\n*Read more: <${link}>*`
        );
      } else {
        await processingMsg.edit(
          "Sorry, I couldn't find anything on the Wiki for that."
        );
      }
    } catch (error) {
      console.error(
        "Google Search Error:",
        error.response ? error.response.data : error.message
      );
      await processingMsg.edit(
        "❌ I ran into an error searching. (Check API Keys)"
      );
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
