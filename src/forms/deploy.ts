import { dedent } from 'ts-dedent'

import { deploy } from '../actions/deploy'
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

        Forms.resetForm(chatId)

        if (value === 'cancel') {
          bot.sendMessage(chatId, 'Deployment cancelled.')
          return
        }

        useWallet(chatId, async (adapter, accounts): Promise<void> => {
          const data = form.getValues()
          const result = await deploy(adapter, accounts[0], data as any)

          let actionNeeded = false
          if ('error' in result.result) {
            if (result.result.error === 'action_needed') {
              actionNeeded = true
            } else {
              bot.sendMessage(chatId, `There was an error deploying the meme coin. Please try again.`)
              return
            }
          }

          bot.sendMessage(
            chatId,
            dedent`
              ${
                actionNeeded
                  ? 'The deployment has been initiated. Please sign the transaction in your wallet.'
                  : 'Memecoin deployed.'
              }
              *Address*: \`${result.tokenAddress}\`
              *Name*: ${data.name}
              *Symbol*: ${data.symbol}
              *Owner*: ${data.ownerAddress}
              *Initial Supply*: ${data.initialSupply}
            `.trim(),
            { parse_mode: 'Markdown' },
          )
        })
      },
    }),
  })

  return form
}
