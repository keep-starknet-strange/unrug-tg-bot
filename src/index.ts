const TelegramBot = require("node-telegram-bot-api");

const bot = getBot();

console.log("Bot is running...");

// ************ COMMANDS ************

// /unrug command
// Matches "/unrug [token_address]"
bot.onText(/\/unrug (.+)/, (msg: { chat: { id: any } }, match: any[]) => {
  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message

  const chatId = msg.chat.id;
  const tokenAddress = match[1]; // the captured "token_address"

  // Prepare the response
  var response;

  // Check if the provided address is a valid StarnNet address
  if (!isValidStarknetAddress(tokenAddress)) {
    response = `The provided address is a not valid Starknet address: ${tokenAddress}`;
    console.log(response);
    bot.sendMessage(chatId, response);
  } else {
    console.log(
      `The provided address is a valid Starknet address: ${tokenAddress}`
    );
    // TODO: Add the logic to check if the token is unruggable or not
    // Mocking the response for now
    const isUnruggable = true;
    const tokenName = "Paint au lait";
    const tokenSymbol = "PAL";
    const teamAlloc = "0.2%";
    const marketcap = "5M";

    if (!isUnruggable) {
      response = "This token is Ruggable ❌";
    } else {
      response =
        "This token IS Unruggable ✅\n" +
        `Token name: ${tokenName}\n` +
        `Token symbol: ${tokenSymbol}\n` +
        `Team alloc: ${teamAlloc}\n` +
        `Marketcap: ${marketcap}`;
    }
    bot.sendMessage(chatId, response);
  }
});

// ************ FUNCTIONS ************

/**
 * Returns a Telegram bot instance.
 *
 * @returns A Telegram bot instance.
 */
function getBot(): any {
  // replace the value below with the Telegram token you receive from @BotFather
  const telegramBotToken = Bun.env.TELEGRAM_BOT_TOKEN;

  // Exit if the token is not provided
  if (!telegramBotToken) {
    console.error("TELEGRAM_BOT_TOKEN is not provided");
    process.exit(1);
  }

  return new TelegramBot(telegramBotToken, { polling: true });
}

/**
 * Checks if a given string is a valid StarkNet address.
 *
 * A valid StarkNet address must start with '0x' followed by 63 or 64 hexadecimal characters.
 *
 * @param address - The string to be tested against the StarkNet address format.
 * @returns `true` if the string is a valid StarkNet address, otherwise `false`.
 */
function isValidStarknetAddress(address: string): boolean {
  const regex = /^0x[0-9a-fA-F]{50,64}$/;
  return regex.test(address);
}
