import { Bot, Context } from "grammy";
import { Env } from "./types";

export function setupForwarder(bot: Bot, env: Env) {
  if (!env.SOURCE_CHANNEL_ID) {
    console.log("SOURCE_CHANNEL_ID not configured, forwarder disabled");
    return;
  }

  const sourceChannelId = env.SOURCE_CHANNEL_ID;
  const targetGroupId = env.GROUP_CHAT_ID;

  bot.on("channel_post", async (ctx: Context) => {
    if (!ctx.channelPost) return;

    const chatId = ctx.channelPost.chat.id.toString();
    console.log(
      `Channel post from ${chatId}, expected ${sourceChannelId}, match: ${chatId === sourceChannelId}`
    );

    if (chatId !== sourceChannelId) return;

    if (!targetGroupId) {
      console.error("GROUP_CHAT_ID not configured");
      return;
    }

    try {
      await ctx.api.forwardMessage(
        targetGroupId,
        chatId,
        ctx.channelPost.message_id
      );
      console.log("Message forwarded successfully");
    } catch (err) {
      console.error("Forward error:", err);
    }
  });
}
