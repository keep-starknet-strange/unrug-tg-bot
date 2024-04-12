import { dedent } from 'ts-dedent'

import { launchOnEkubo, launchOnStandardAMM } from '../actions/launch'
import { getMemecoin } from '../actions/memecoinData'
import { bot } from '../services/bot'
import { useWallet } from '../services/wallet'
import { AMMs, DECIMALS } from '../utils/constants'
import { createForm, defineField, Forms } from '../utils/form'
import { decimalsScale } from '../utils/helpers'
import { LaunchValidation } from '../utils/validation'

export type LaunchForm = ReturnType<ReturnType<typeof createLaunchForm>['getValues']>

const getLaunchInfoMessage = (data: LaunchForm): string => {
  const disableAfter = `${Math.floor((data.antiBotPeriod ?? 0) / 60)}:${(data.antiBotPeriod ?? 0) % 60}`

  let message = ''
  message += `*AMM*: ${AMMs[data.amm as keyof typeof AMMs].name}\n`
  message += `*Team Allocations*: ${data.teamAllocations.length}\n`

  data.teamAllocations.forEach((allocation: any) => {
    message += `*  Amount*: ${allocation.amount}\n`
    message += `*  Address*: ${allocation.address}\n\n`
  })

  message += `*Hold Limit*: ${data.holdLimit}%\n`
  message += `*Disable Antibot After*: ${disableAfter}\n`
  message += `*Starting Market Cap*: $${data.startingMarketCap}\n`

  if (data.amm === 'ekubo') message += `*Ekubo Fees*: ${data.ekuboFees}%\n`

  message += '*Liquidity Lock*: '
  if (!data.lockLiquidity === undefined || data.lockLiquidity === Infinity) message += 'Forever\n'
  else message += `${data.lockLiquidity} months\n`

  return message.trim()
}

export const createLaunchForm = (chatId: number) => {
  const form = createForm(chatId, {
    address: defineField({
      type: 'text',
      value: undefined as string | undefined,
      message: `Please enter the *address* of the token you want to launch.`,
      validation: LaunchValidation.address,
      handler: async ({ value }) => {
        const token = await getMemecoin(value)
        if (!token) {
          bot.sendMessage(chatId, 'Invalid token address. Please provide a valid unruggable memecoin address.')
          return
        }
        if (token?.isLaunched) {
          bot.sendMessage(chatId, 'This token has already been launched.')
          return
        }

        form.setValue('address', value)
        form.setActiveField('amm')
      },
    }),
    amm: defineField({
      type: 'choice',
      value: undefined as keyof typeof AMMs | undefined,
      message: () => {
        let message = `Please choose an AMM to launch your token.`
        Object.values(AMMs).forEach((amm) => {
          message += `\n\n*${amm.name}*: ${amm.description}`
        })
        return message
      },
      choices: Object.entries(AMMs).map(([key, amm]) => ({
        key,
        title: amm.name,
      })),
      handler: ({ value }) => {
        if (!Object.keys(AMMs).includes(value)) {
          bot.sendMessage(chatId, 'Invalid AMM selected. Please choose a valid AMM.')
          return
        }

        form.setValue('amm', value as keyof typeof AMMs)
        form.setActiveField('addTeamAllocation')
      },
    }),

    teamAllocations: defineField({
      message: '',
      type: 'text',
      value: [] as {
        address: string
        amount: number
      }[],
      handler: async () => {
        // Unused, only stores the team allocations
      },
    }),
    addTeamAllocation: defineField({
      type: 'choice',
      value: undefined,
      message: `Would you like to add team allocation? You can add up to 10 team allocations.`,
      choices: [
        { key: 'yes', title: 'Yes' },
        { key: 'no', title: 'No' },
      ],
      handler: ({ value }) => {
        if (value === 'yes') form.setActiveField('teamAllocationAmount')
        else form.setActiveField('holdLimit')
      },
    }),
    addNewTeamAllocation: defineField({
      type: 'choice',
      value: undefined,
      message: `Would you like to add another team allocation?`,
      choices: [
        { key: 'yes', title: 'Yes' },
        { key: 'no', title: 'No' },
      ],
      handler: ({ value }) => {
        if (value === 'yes') form.setActiveField('teamAllocationAmount')
        else form.setActiveField('holdLimit')
      },
    }),
    teamAllocationAmount: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `Please provide the amount of tokens to allocate to the holder.`,
      validation: LaunchValidation.teamAllocationAmount,
      handler: async ({ value }) => {
        const values = form.getValues()
        if (!values.address) return

        const token = await getMemecoin(values.address)
        if (!token) return

        const totalTeamAllocation =
          BigInt(values.teamAllocations.reduce((acc: number, allocation: any) => acc + allocation.amount, 0)) *
          BigInt(decimalsScale(DECIMALS))
        const totalSupply = BigInt(token.totalSupply)

        if (totalTeamAllocation > totalSupply / BigInt(10)) {
          await bot.sendMessage(
            chatId,
            dedent`
              Total team allocation exceeds 10% of total supply of the token.
              *Total Supply*: ${totalSupply / BigInt(decimalsScale(DECIMALS))}
              *Total Team Allocation*: ${totalTeamAllocation / BigInt(decimalsScale(DECIMALS))}
            `.trim(),
            { parse_mode: 'Markdown' },
          )
          return
        }

        form.setValue('teamAllocationAmount', value)
        form.setActiveField('teamAllocationAddress')
      },
    }),
    teamAllocationAddress: defineField({
      type: 'text',
      value: undefined as string | undefined,
      message: `Please provide the address of the holder.`,
      validation: LaunchValidation.teamAllocationAddress,
      handler: ({ value }) => {
        const values = form.getValues()
        const newTeamAllocations = [
          ...values.teamAllocations,
          {
            address: value,
            amount: values.teamAllocationAmount as number,
          },
        ]

        form.setValue('teamAllocations', newTeamAllocations)
        form.setValue('teamAllocationAmount', undefined)
        form.setValue('teamAllocationAddress', undefined)

        if (newTeamAllocations.length === 10) {
          bot.sendMessage(
            chatId,
            'Maximum of 10 team allocations reached. Please continue to the form.setActiveField steps.',
          )
          form.setActiveField('holdLimit')
          return
        }

        form.setActiveField('addNewTeamAllocation')
      },
    }),

    holdLimit: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `Please provide the hold limit between 0.5% and 100%. (1% recommended)`,
      validation: LaunchValidation.holdLimit,
      handler: ({ value }) => {
        form.setValue('holdLimit', value)
        form.setActiveField('antiBotPeriod')
      },
    }),
    antiBotPeriod: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `When should the anti bot features be disabled? Between 00:30 - 24:00. 24:00 Recommended. (hh:mm format)`,
      validation: LaunchValidation.antiBotPeriod,
      handler: ({ value }) => {
        const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10)) || []
        const time = hours * 60 + minutes

        form.setValue('antiBotPeriod', time)
        form.setActiveField('startingMarketCap')
      },
    }),
    startingMarketCap: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `Please provide the starting market cap (in USD) of the token. (10.000$ Recommended)`,
      validation: LaunchValidation.startingMarketCap,
      handler: ({ value }) => {
        form.setValue('startingMarketCap', value)

        const values = form.getValues()
        if (values.amm === 'ekubo') form.setActiveField('ekuboFees')
        else form.setActiveField('lockLiquidity')
      },
    }),
    ekuboFees: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `Please provide the Ekubo fees. (0.3% Recommended)`,
      validation: LaunchValidation.ekuboFees,
      handler: ({ value }) => {
        form.setValue('ekuboFees', value)
        form.setActiveField('launch')
      },
    }),
    lockLiquidity: defineField({
      type: 'text',
      value: undefined as number | undefined,
      message: `How long would you like to lock the liquidity? (in months between 6 - 24) or type *forever* for permanent lock.`,
      validation: LaunchValidation.lockLiquidty,
      handler: ({ value }) => {
        form.setValue('lockLiquidity', value === 'forever' ? Infinity : Number(value))
        form.setActiveField('launch')
      },
    }),

    launch: defineField({
      type: 'choice',
      value: undefined,
      message: () => {
        const values = form.getValues() as any
        const getMessage = getLaunchInfoMessage as any
        return getMessage(values)
      },
      choices: [
        { key: 'cancel', title: 'Cancel' },
        { key: 'confirm', title: 'Launch' },
      ],
      handler: ({ value, query }) => {
        if (!query.message) return
        bot.deleteMessage(chatId, query.message.message_id)

        Forms.resetForm(chatId)

        if (value === 'cancel') {
          bot.sendMessage(chatId, 'Launch cancelled and all data has been discarded.')
          return
        }

        useWallet(chatId, async (adapter, accounts): Promise<void> => {
          const data = form.getValues()

          let result
          if (data.amm === 'ekubo') result = await launchOnEkubo(adapter, accounts[0], data as any)
          else result = await launchOnStandardAMM(adapter, accounts[0], data as any)

          let actionNeeded = false
          if ('error' in result) {
            if (result.error === 'action_needed') {
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
                ? 'The launch has been initiated. Please sign the transaction in your wallet.'
                : 'Memecoin launched.'
            }
              ${getLaunchInfoMessage(data)}
            `.trim(),
            { parse_mode: 'Markdown' },
          )
        })
      },
    }),
  })

  return form
}
