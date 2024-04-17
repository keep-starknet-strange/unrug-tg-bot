import { createLaunchForm } from '../forms/launch'
import { bot, botInfo } from '../services/bot'
import { Forms } from '../utils/form'

bot.onText(/^\/launch/, async (msg): Promise<void> => {
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id, 'This command can only be used in a private chat.', {
      reply_markup: {
        inline_keyboard: [[{ text: 'Send a private message', url: `https://t.me/${botInfo.username}` }]],
      },
    })
    return
  }

  Forms.resetForm(msg.chat.id)
  const form = createLaunchForm(msg.chat.id)
  Forms.setForm(msg.chat.id, form)

  await bot.sendMessage(msg.chat.id, "Hi! Let's launch your token!")

  form.setActiveField('address')
})
