import { CallData, stark, uint256 } from 'starknet'
import dedent from 'ts-dedent'

import { bot } from '../services/bot'
import { useWallet } from '../services/wallet'
import { isValidL2Address } from '../utils/address'
import { DECIMALS, FACTORY_ADDRESS, Selector } from '../utils/constants'
import { formState } from '../utils/formState'
import { decimalsScale } from '../utils/helpers'

bot.onText(/\/deploy/, async (msg): Promise<void> => {
  formState.resetForm(msg.chat.id)

  await bot.sendMessage(
    msg.chat.id,
    `Hi there! Let's deploy a meme coin! Please provide the *Name* of the coin you want to deploy.`,
    { parse_mode: 'Markdown' },
  )

  formState.setActiveForm(msg.chat.id, 'deploy')
  formState.setActiveField(msg.chat.id, 'name')
})

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return

  const form = formState.getForm(msg.chat.id)
  if (form?.activeForm !== 'deploy') return

  const activeField = form?.activeField

  if (activeField === 'name') {
    // TODO: max length?
    if (msg.text.length > 256) {
      bot.sendMessage(
        msg.chat.id,
        `The *Name* of the coin can't be longer than 256 characters. Please provide a shorter name.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    // TODO: min length?
    if (msg.text.length < 2) {
      bot.sendMessage(
        msg.chat.id,
        `The *Name* of the coin can't be shorter than 2 characters. Please provide a longer name.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    formState.setValue(msg.chat.id, 'name', msg.text)

    bot.sendMessage(msg.chat.id, `Great! Now please provide the *Symbol* of the coin.`, {
      parse_mode: 'Markdown',
    })

    formState.setActiveField(msg.chat.id, 'symbol')
  }

  if (activeField === 'symbol') {
    if (msg.text.length > 256) {
      bot.sendMessage(
        msg.chat.id,
        `The *Symbol* of the coin can't be longer than 256 characters. Please provide a shorter symbol.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    // TODO: min length?
    if (msg.text.length < 2) {
      bot.sendMessage(
        msg.chat.id,
        `The *Symbol* of the coin can't be shorter than 2 characters. Please provide a longer symbol.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    formState.setValue(msg.chat.id, 'symbol', msg.text)

    bot.sendMessage(msg.chat.id, `Great! Now please provide the *Owner Address* of the coin.`, {
      parse_mode: 'Markdown',
    })

    formState.setActiveField(msg.chat.id, 'ownerAddress')
  }

  if (activeField === 'ownerAddress') {
    if (!isValidL2Address(msg.text)) {
      bot.sendMessage(
        msg.chat.id,
        `The *Owner Address* is invalid. Please provide a valid Starknet address.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    formState.setValue(msg.chat.id, 'ownerAddress', msg.text)

    bot.sendMessage(msg.chat.id, `Great! Now please provide the *Initial Supply* of the coin.`, {
      parse_mode: 'Markdown',
    })

    formState.setActiveField(msg.chat.id, 'initialSupply')
  }

  if (activeField === 'initialSupply') {
    const value = parseInt(msg.text.replace(/[^0-9]/g, ''), 10)
    if (isNaN(value) || value <= 0) {
      bot.sendMessage(
        msg.chat.id,
        `The *Initial Supply* is invalid. Please provide a valid number.`,
        { parse_mode: 'Markdown' },
      )
      return
    }

    formState.setValue(msg.chat.id, 'initialSupply', value.toString())
    formState.setActiveField(msg.chat.id, 'deploy')

    const newForm = formState.getForm(msg.chat.id)

    bot.sendMessage(
      msg.chat.id,
      dedent`
        Great! Here's a summary of the data you've provided.
        *Name*: ${newForm?.values.name}
        *Symbol*: ${newForm?.values.symbol}
        *Owner Address*: ${newForm?.values.ownerAddress}
        *Initial Supply*: ${newForm?.values.initialSupply}
      `.trim(),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Cancel',
                callback_data: `deploy_cancel`,
              },
              {
                text: 'Deploy',
                callback_data: `deploy_confirm`,
              },
            ],
          ],
        },
      },
    )

    // connect wallet and deploy

    console.log(formState.getForm(msg.chat.id))
  }
})

bot.on('callback_query', (query) => {
  if (!query.data || !query.message || !query.data.startsWith('deploy_')) return
  const chatId = query.message.chat.id

  const form = formState.getForm(chatId)

  if (form?.activeForm !== 'deploy' || form.activeField !== 'deploy') return

  if (query.data === 'deploy_cancel') {
    formState.resetForm(chatId)
    bot.deleteMessage(chatId, query.message.message_id)
    bot.sendMessage(chatId, 'Deployment cancelled.')
  }

  if (query.data === 'deploy_confirm') {
    formState.resetForm(chatId)
    bot.deleteMessage(chatId, query.message.message_id)

    useWallet(chatId, 'argentMobile', async (wallet): Promise<void> => {
      const account = wallet.accounts[0]
      if (!account) return

      const salt = stark.randomAddress()

      const constructorCalldata = CallData.compile([
        form.values.ownerAddress,
        form.values.name,
        form.values.symbol,
        uint256.bnToUint256(BigInt(form.values.initialSupply) * BigInt(decimalsScale(DECIMALS))),
        salt,
      ])

      const result = await wallet.invokeTransaction({
        accountAddress: account,
        executionRequest: {
          calls: [
            {
              contractAddress: FACTORY_ADDRESS,
              entrypoint: Selector.CREATE_MEMECOIN,
              calldata: constructorCalldata,
            },
          ],
        },
      })

      if ('error' in result) {
        bot.sendMessage(chatId, `There was an error deploying the meme coin. Please try again.`)
        return
      }
    })
  }
})
