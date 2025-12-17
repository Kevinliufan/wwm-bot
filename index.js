const { Client, GatewayIntentBits } = require('discord.js');
const { search } = require('duck-duck-scrape');
const express = require('express');

// --- KEEP ALIVE SERVER ---
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Where Winds Meet Bot is Alive!');
});

app.listen(port, () => {
  console.log(`Web server listening on port ${port}`);
});

// --- BOT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;

  // Check if message starts with !ask
  if (message.content.startsWith('!ask ')) {
    const query = message.content.slice(5).trim();
    
    // Send initial "searching" message
    const processingMsg = await message.reply(`🔍 Searching the Wiki for: **${query}**...`);

    try {
      // Search specific Fextralife site
      const searchResults = await search(`site:wherewindsmeet.wiki.fextralife.com ${query}`, {
        safeSearch: 0
      });

      if (searchResults.results && searchResults.results.length > 0) {
        const firstResult = searchResults.results[0];
        // Edit the message with the result
        await processingMsg.edit(`**I found this on the Wiki:**\n${firstResult.description}\n\n*Read more: <${firstResult.url}>*`);
      } else {
        await processingMsg.edit("Sorry, I couldn't find anything on the Fextralife Wiki for that.");
      }

    } catch (error) {
      console.error('Search error:', error);
      await processingMsg.edit("An error occurred while searching.");
    }
  }
});

// Login using the secret token (we set this in Render later)
client.login(process.env.DISCORD_TOKEN);
