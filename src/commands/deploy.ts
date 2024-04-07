import { CallData, hash, stark, uint256 } from 'starknet'
import { dedent } from 'ts-dedent'

import { bot } from '../services/bot'
import { useWallet } from '../services/wallet'
import { DECIMALS, FACTORY_ADDRESS, Selector, TOKEN_CLASS_HASH } from '../utils/constants'
import { deployForm, formState } from '../utils/formState'
import { decimalsScale } from '../utils/helpers'
import { DeployValidation, validateAndSend } from '../utils/validation'

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
    const value = validateAndSend(msg.chat.id, msg.text, DeployValidation.name)
    if (value === false) return

    deployForm.setValue(msg.chat.id, 'name', msg.text)
    deployForm.setActiveField(msg.chat.id, 'symbol')

    bot.sendMessage(msg.chat.id, `Please provide the *Symbol* of the coin.`, {
      parse_mode: 'Markdown',
    })
  }

  if (activeField === 'symbol') {
    const value = validateAndSend(msg.chat.id, msg.text, DeployValidation.symbol)
    if (value === false) return

    deployForm.setValue(msg.chat.id, 'symbol', msg.text)
    deployForm.setActiveField(msg.chat.id, 'ownerAddress')

    bot.sendMessage(msg.chat.id, `Please provide the *Owner Address* of the coin.`, {
      parse_mode: 'Markdown',
    })
  }

  if (activeField === 'ownerAddress') {
    const value = validateAndSend(msg.chat.id, msg.text, DeployValidation.ownerAddress)
    if (value === false) return

    deployForm.setValue(msg.chat.id, 'ownerAddress', msg.text)
    deployForm.setActiveField(msg.chat.id, 'initialSupply')

    bot.sendMessage(msg.chat.id, `Please provide the *Initial Supply* of the coin.`, {
      parse_mode: 'Markdown',
    })
  }

  if (activeField === 'initialSupply') {
    const value = validateAndSend(msg.chat.id, msg.text, DeployValidation.initialSupply)
    if (value === false) return

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
