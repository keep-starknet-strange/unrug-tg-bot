import { createDeployForm } from '../forms/deploy'
import { bot } from '../services/bot'
import { Forms } from '../utils/form'

bot.onText(/\/deploy/, async (msg): Promise<void> => {
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id, 'This command can only be used in a private chat.')
    return
  }

  Forms.resetForm(msg.chat.id)
  const form = createDeployForm(msg.chat.id)
  Forms.setForm(msg.chat.id, form)

  await bot.sendMessage(msg.chat.id, "Hi! Let's deploy a meme coin!")

  form.setActiveField('name')
})
