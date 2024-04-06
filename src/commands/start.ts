import { bot } from '../services/bot'
import { formState } from '../utils/formState'

bot.onText(/\/start/, async (msg): Promise<void> => {
  formState.resetForm(msg.chat.id)

  await bot.sendMessage(
    msg.chat.id,
    `Hello, You can use /unrug command to check if a token is unrugabble or not.`,
  )
})
