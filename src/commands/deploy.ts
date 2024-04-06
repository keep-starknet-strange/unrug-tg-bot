import { CallData, hash, stark, uint256 } from 'starknet'
import { dedent } from 'ts-dedent'

import { bot } from '../services/bot'
import { useWallet } from '../services/wallet'
import { isValidL2Address } from '../utils/address'
import { DECIMALS, FACTORY_ADDRESS, Selector, TOKEN_CLASS_HASH } from '../utils/constants'
import { deployForm, formState } from '../utils/formState'
import { decimalsScale } from '../utils/helpers'

// TODO: use zod, yup or another validation library
const validateName = (name: string | undefined, chatId: number): name is string => {
  // TODO: min length?
  if (!name || name.length < 2) {
    bot.sendMessage(
      chatId,
      `The *Name* of the coin can't be shorter than 2 characters. Please provide a longer name.`,
      { parse_mode: 'Markdown' },
    )
    return false
  }

  // TODO: max length?
  if (name.length > 256) {
    bot.sendMessage(
      chatId,
      `The *Name* of the coin can't be longer than 256 characters. Please provide a shorter name.`,
      { parse_mode: 'Markdown' },
    )
    return false
  }

  return true
}

const validateSymbol = (symbol: string | undefined, chatId: number): symbol is string => {
  // TODO: min length?
  if (!symbol || symbol.length < 2) {
    bot.sendMessage(
      chatId,
      `The *Symbol* of the coin can't be shorter than 2 characters. Please provide a longer symbol.`,
      { parse_mode: 'Markdown' },
    )
    return false
  }

  // TODO: max length?
  if (symbol.length > 256) {
    bot.sendMessage(
      chatId,
      `The *Symbol* of the coin can't be longer than 256 characters. Please provide a shorter symbol.`,
      { parse_mode: 'Markdown' },
    )
    return false
  }

  return true
}

const validateAddress = (address: string | undefined, chatId: number): address is string => {
  if (!address || !isValidL2Address(address)) {
    bot.sendMessage(
      chatId,
      `The *Owner Address* is invalid. Please provide a valid Starknet address.`,
      { parse_mode: 'Markdown' },
    )
    return false
  }

  return true
}

const validateInitialSupply = (
  initialSupply: number | undefined,
  chatId: number,
): initialSupply is number => {
  if (initialSupply === undefined || isNaN(initialSupply) || initialSupply <= 0) {
    bot.sendMessage(chatId, `The *Initial Supply* is invalid. Please provide a valid number.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  return true
}

bot.onText(/\/deploy/, async (msg): Promise<void> => {
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id, 'This command can only be used in a private chat.')
    return
  }

  formState.resetForm(msg.chat.id)

  await bot.sendMessage(
    msg.chat.id,
    `Hi there! Let's deploy a meme coin! Please provide the *Name* of the coin you want to deploy.`,
    { parse_mode: 'Markdown' },
  )

  formState.setActiveForm(msg.chat.id, 'deploy')
  deployForm.setActiveField(msg.chat.id, 'name')
})

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return

  const form = formState.getForm(msg.chat.id)
  if (form?.activeForm !== 'deploy') return

  const activeField = form?.activeField

  if (activeField === 'name') {
    if (!validateName(msg.text, msg.chat.id)) return

    deployForm.setValue(msg.chat.id, 'name', msg.text)
    deployForm.setActiveField(msg.chat.id, 'symbol')

    bot.sendMessage(msg.chat.id, `Please provide the *Symbol* of the coin.`, {
      parse_mode: 'Markdown',
    })
  }

  if (activeField === 'symbol') {
    if (!validateSymbol(msg.text, msg.chat.id)) return

    deployForm.setValue(msg.chat.id, 'symbol', msg.text)
    deployForm.setActiveField(msg.chat.id, 'ownerAddress')

    bot.sendMessage(msg.chat.id, `Please provide the *Owner Address* of the coin.`, {
      parse_mode: 'Markdown',
    })
  }

  if (activeField === 'ownerAddress') {
    if (!validateAddress(msg.text, msg.chat.id)) return

    deployForm.setValue(msg.chat.id, 'ownerAddress', msg.text)
    deployForm.setActiveField(msg.chat.id, 'initialSupply')

    bot.sendMessage(msg.chat.id, `Please provide the *Initial Supply* of the coin.`, {
      parse_mode: 'Markdown',
    })
  }

  if (activeField === 'initialSupply') {
    const value = parseInt(msg.text.replace(/[^0-9]/g, ''), 10)
    if (!validateInitialSupply(value, msg.chat.id)) return

    deployForm.setValue(msg.chat.id, 'initialSupply', value)
    deployForm.setActiveField(msg.chat.id, 'deploy')

    const newForm = deployForm.getForm(msg.chat.id)

    bot.sendMessage(
      msg.chat.id,
      dedent`
        Here's a summary of the data you've provided.
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
  }
})

bot.on('callback_query', (query) => {
  if (!query.data || !query.message || !query.data.startsWith('deploy_')) return
  const chatId = query.message.chat.id

  const form = deployForm.getForm(chatId)

  if (form?.activeForm !== 'deploy' || form.activeField !== 'deploy') return

  if (query.data === 'deploy_cancel') {
    deployForm.resetForm(chatId)
    bot.deleteMessage(chatId, query.message.message_id)
    bot.sendMessage(chatId, 'Deployment cancelled.')
  }

  if (query.data === 'deploy_confirm') {
    deployForm.resetForm(chatId)
    bot.deleteMessage(chatId, query.message.message_id)

    if (
      !validateName(form.values.name, chatId) ||
      !validateSymbol(form.values.symbol, chatId) ||
      !validateAddress(form.values.ownerAddress, chatId) ||
      !validateInitialSupply(form.values.initialSupply, chatId)
    )
      return

    useWallet(chatId, 'argentMobile', async (wallet): Promise<void> => {
      const account = wallet.accounts[0]
      if (!account) return

      const salt = stark.randomAddress()

      /* eslint-disable @typescript-eslint/no-non-null-assertion */
      const constructorCalldata = CallData.compile([
        form.values.ownerAddress!,
        form.values.name!,
        form.values.symbol!,
        uint256.bnToUint256(BigInt(form.values.initialSupply!) * BigInt(decimalsScale(DECIMALS))),
        salt,
      ])
      /* eslint-enable @typescript-eslint/no-non-null-assertion */

      const tokenAddress = hash.calculateContractAddressFromHash(
        salt,
        TOKEN_CLASS_HASH,
        constructorCalldata.slice(0, -1),
        FACTORY_ADDRESS,
      )

      bot.sendMessage(chatId, `Please approve the transaction in your wallet.`)

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

      bot.sendMessage(
        chatId,
        dedent`
          Meme coin deployed.
          *Address*: ${tokenAddress}
          *Name*: ${form.values.name}
          *Symbol*: ${form.values.symbol}
          *Owner*: ${form.values.ownerAddress}
          *Initial Supply*: ${form.values.initialSupply}
        `.trim(),
      )
    })
  }
})
