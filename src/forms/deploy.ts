import { dedent } from 'ts-dedent'

import { deploy } from '../actions/deploy'
import { Adapters } from '../adapters'
import { bot } from '../services/bot'
import { useWallet } from '../services/wallet'
import { createForm, defineField, Forms } from '../utils/form'
import { DeployValidation } from '../utils/validation'

export type DeployForm = ReturnType<ReturnType<typeof createDeployForm>['getValues']>

export const createDeployForm = (chatId: number) => {
  const form = createForm(chatId, {
    name: defineField({
      type: 'text',
      value: undefined as string | undefined,
      message: `Please provide the *Name* of the coin you want to deploy.`,
      validation: DeployValidation.name,
      handler: ({ value }) => {
        form.setValue('name', value)
        form.setActiveField('symbol')
      },
    }),
    symbol: defineField({
      type: 'text',
      value: undefined as string | undefined,
      message: `Please provide the *Symbol* of the coin you want to deploy.`,
      validation: DeployValidation.symbol,
      handler: ({ value }) => {
        form.setValue('symbol', value)
        form.setActiveField('ownerAddress')
      },
    }),
    ownerAddress: defineField({
      type: 'text',
      value: undefined as string | undefined,
      message: `Please provide the *Owner Address* of the coin.`,
      validation: DeployValidation.ownerAddress,
      handler: ({ value }) => {
        form.setValue('ownerAddress', value)
        form.setActiveField('initialSupply')
      },
    }),
    initialSupply: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `Please provide the *Initial Supply* of the coin.`,
      validation: DeployValidation.initialSupply,
      handler: ({ value }) => {
        form.setValue('initialSupply', value)
        form.setActiveField('deploy')
      },
    }),
    deploy: defineField({
      type: 'choice',
      value: undefined,
      message: () => {
        const values = form.getValues() as any

        return dedent`
          Here's a summary of the data you've provided.
          *Name*: ${values.name}
          *Symbol*: ${values.symbol}
          *Owner Address*: ${values.ownerAddress}
          *Initial Supply*: ${values.initialSupply}
        `.trim()
      },
      choices: [
        {
          key: 'cancel',
          title: 'Cancel',
        },
        {
          key: 'deploy',
          title: 'Deploy',
        },
      ],
      handler: ({ value, query }) => {
        // query.message can't be null since form already checks for it. Re-checking for type safety.
        if (!query.message) return
        bot.deleteMessage(chatId, query.message.message_id)

        if (value === 'cancel') {
          Forms.resetForm(chatId)
          bot.sendMessage(chatId, 'Deployment cancelled.')
        }

        form.setActiveField('wallet')
      },
    }),
    wallet: defineField({
      type: 'choice',
      value: undefined,
      message: `Please choose your wallet.`,
      choices: [
        {
          key: 'cancel',
          title: 'Cancel',
        },
        ...Object.entries(Adapters).map(([key, adapter]) => ({
          key,
          title: adapter.name,
        })),
      ],
      handler: ({ value, query }) => {
        // query.message can't be null since form already checks for it. Re-checking for type safety.
        if (!query.message) return
        bot.deleteMessage(chatId, query.message.message_id)

        if (value === 'cancel') {
          Forms.resetForm(chatId)
          bot.sendMessage(chatId, 'Deployment cancelled.')
          return
        }

        const adapterName = value as keyof typeof Adapters
        if (!Adapters[adapterName]) {
          bot.sendMessage(chatId, 'Invalid wallet selected.')
          return
        }

        Forms.resetForm(chatId)

        useWallet(chatId, adapterName, async (adapter, accounts): Promise<void> => {
          bot.sendMessage(chatId, `Please approve the transaction in your wallet.`)

          const data = form.getValues()
          const result = await deploy(adapter, accounts[0], data as any)

          if ('error' in result) {
            bot.sendMessage(chatId, `There was an error deploying the meme coin. Please try again.`)
            return
          }

          bot.sendMessage(
            chatId,
            dedent`
              Memecoin deployed.
              *Address*: \`${result.tokenAddress}\`
              *Name*: ${data.name}
              *Symbol*: ${data.symbol}
              *Owner*: ${data.ownerAddress}
              *Initial Supply*: ${data.initialSupply}
            `.trim(),
          )
        })
      },
    }),
  })

  return form
}
