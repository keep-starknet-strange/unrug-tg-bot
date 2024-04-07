import dedent from 'ts-dedent'

import { bot } from '../services/bot'
import { AMMs, DECIMALS } from '../utils/constants'
import { formState, launchForm } from '../utils/formState'
import { decimalsScale } from '../utils/helpers'
import { getTokenData, parseTokenData } from '../utils/memecoinData'
import { LaunchValidation, validateAndSend } from '../utils/validation'

bot.onText(/\/launch/, async (msg): Promise<void> => {
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id, 'This command can only be used in a private chat.')
    return
  }

  formState.resetForm(msg.chat.id)

  await bot.sendMessage(
    msg.chat.id,
    `Hi! Let's launch your meme coin! Please enter the *address* your token.`,
    { parse_mode: 'Markdown' },
  )

  formState.setActiveForm(msg.chat.id, 'launch')
  launchForm.setActiveField(msg.chat.id, 'address')
})

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return
  const chatId = msg.chat.id

  const form = launchForm.getForm(chatId)
  if (form?.activeForm !== 'launch') return

  const activeField = form?.activeField

  if (activeField === 'address') {
    const value = validateAndSend(chatId, msg.text, LaunchValidation.address)
    if (value === false) return

    const rawToken = await getTokenData(value)
    const token = await parseTokenData(value, rawToken)

    if (!token) {
      bot.sendMessage(
        chatId,
        'Invalid token address. Please provide a valid unruggable meme token address.',
      )
      return
    }
    if (token?.isLaunched) {
      bot.sendMessage(chatId, 'This token has already been launched.')
      return
    }

    let ammMessage = 'Please choose an AMM to launch your token.'
    Object.values(AMMs).forEach((amm) => {
      ammMessage += `\n\n*${amm.name}*: ${amm.description}`
    })

    bot.sendMessage(chatId, ammMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          Object.entries(AMMs).map(([key, amm]) => ({
            text: amm.name,
            callback_data: `launch_amm_${key}`,
          })),
        ],
      },
    })

    launchForm.setActiveField(chatId, 'amm')
  }

  if (activeField === 'teamAllocationAmount') {
    const value = validateAndSend(chatId, msg.text, LaunchValidation.teamAllocationAmount)
    if (value === false) return

    launchForm.setValue(chatId, 'teamAllocationAmount', value)
    launchForm.setActiveField(chatId, 'teamAllocationAddress')

    bot.sendMessage(chatId, `Please provide the address of the team member.`)
  }

  if (activeField === 'teamAllocationAddress') {
    const value = validateAndSend(chatId, msg.text, LaunchValidation.teamAllocationAddress)
    if (value === false) return

    launchForm.setValue(chatId, 'teamAllocation', [
      ...form.values.teamAllocation,
      {
        holderAddress: value,

        // Amount already verified by previous step
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        amount: form.values.teamAllocationAmount!,
      },
    ])
    launchForm.setActiveField(chatId, 'teamAllocation')

    bot.sendMessage(
      chatId,
      dedent`
        Team allocation added!
        *Amount*: ${form.values.teamAllocationAmount}
        *Address*: ${msg.text}
        Would you like to add another team allocation?
      `.trim(),
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'No',
                callback_data: 'launch_team_allocation_continue',
              },
              {
                text: 'Yes',
                callback_data: 'launch_team_allocation_add',
              },
            ],
          ],
        },
      },
    )
  }

  if (activeField === 'holdLimit') {
    const value = validateAndSend(chatId, msg.text, LaunchValidation.holdLimit)
    if (value === false) return

    launchForm.setValue(chatId, 'holdLimit', value)
    launchForm.setActiveField(chatId, 'disableAntibotAfter')

    bot.sendMessage(
      chatId,
      `When should the anti bot features be disabled? Between 00:30 - 24:00 (hh:mm format, e.g. 12:30)`,
    )
  }

  if (activeField === 'disableAntibotAfter') {
    const value = validateAndSend(chatId, msg.text, LaunchValidation.disableAfter)
    if (value === false) return

    const [hours, minutes] = value.split(':').map((part) => parseInt(part, 10)) || []
    const time = hours * 60 + minutes

    launchForm.setValue(chatId, 'disableAntibotAfter', time)
    launchForm.setActiveField(chatId, 'startingMarketCap')

    bot.sendMessage(
      chatId,
      `Please provide the starting market cap (in USD) of the token. (10.000$ Recommended)`,
    )
  }

  if (activeField === 'startingMarketCap') {
    const value = validateAndSend(chatId, msg.text, LaunchValidation.startingMarketCap)
    if (value === false) return

    launchForm.setValue(chatId, 'startingMarketCap', value)

    switch (form.values.amm) {
      case 'ekubo': {
        launchForm.setActiveField(chatId, 'ekuboFees')
        bot.sendMessage(chatId, `Please provide the Ekubo fees. (0.3% Recommended)`)

        break
      }

      case 'jediswap':
      case 'starkdefi': {
        launchForm.setActiveField(chatId, 'lockLiquidity')
        bot.sendMessage(
          chatId,
          `How long would you like to lock the liquidity? (in months between 6 - 24) or type *forever* for permanent lock.`,
        )

        break
      }
    }
  }

  if (activeField === 'ekuboFees' || activeField === 'lockLiquidity') {
    if (activeField === 'ekuboFees') {
      const value = validateAndSend(chatId, msg.text, LaunchValidation.ekuboFees)
      if (value === false) return

      launchForm.setValue(chatId, 'ekuboFees', value)
    }

    if (activeField === 'lockLiquidity') {
      const value = validateAndSend(chatId, msg.text, LaunchValidation.lockLiquidty)
      if (value === false) return

      launchForm.setValue(chatId, 'lockLiquidity', value === 'forever' ? Infinity : Number(value))
    }

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const { disableAntibotAfter } = form.values
    const disableAfter = `${Math.floor(disableAntibotAfter! / 60)}:${disableAntibotAfter! % 60}`

    let message = "Here's a summary of the data you've provided:\n"
    message += `*AMM*: ${AMMs[form.values.amm!].name}\n`
    message += `*Team Allocations*: ${form.values.teamAllocation.length}\n`

    form.values.teamAllocation.forEach((allocation) => {
      message += `*  Amount*: ${allocation.amount}\n`
      message += `*  Address*: ${allocation.holderAddress}\n\n`
    })

    message += `*Hold Limit*: ${form.values.holdLimit}%\n`
    message += `*Disable Antibot After*: ${disableAfter}\n`
    message += `*Starting Market Cap*: $${form.values.startingMarketCap}\n`

    switch (form.values.amm) {
      case 'ekubo':
        message += `*Ekubo Fees*: ${form.values.ekuboFees}%\n`
        break

      case 'jediswap':
      case 'starkdefi':
        message += '*Lock Liquidity For*: '
        if (form.values.lockLiquidity === Infinity) message += 'Forever\n'
        else message += `${form.values.lockLiquidity} months\n`
    }
    /* eslint-enable @typescript-eslint/no-non-null-assertion */

    launchForm.setActiveField(chatId, 'launch')

    bot.sendMessage(chatId, message.trim(), {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: 'Cancel',
              callback_data: `launch_launch_cancel`,
            },
            {
              text: 'Launch',
              callback_data: `launch_launch_confirm`,
            },
          ],
        ],
      },
    })
  }
})

bot.on('callback_query', async (query) => {
  if (!query.data || !query.message || !query.data.startsWith('launch_')) return
  const chatId = query.message.chat.id

  const form = launchForm.getForm(chatId)

  if (form?.activeForm !== 'launch') return

  if (form?.activeField === 'amm') {
    const amm = query.data.replace('launch_amm_', '')

    if (!Object.keys(AMMs).includes(amm)) {
      bot.sendMessage(chatId, 'Invalid AMM selected. Please choose a valid AMM.')
      return
    }

    launchForm.setValue(chatId, 'amm', amm as keyof typeof AMMs)
    launchForm.setActiveField(chatId, 'teamAllocation')

    bot.sendMessage(
      chatId,
      `Great! Would you like to add team allocation? You can add up to 10 team allocations.`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'No',
                callback_data: 'launch_team_allocation_continue',
              },
              {
                text: 'Yes',
                callback_data: 'launch_team_allocation_add',
              },
            ],
          ],
        },
      },
    )
  }

  if (form?.activeField === 'teamAllocation') {
    if (!query.data.startsWith('launch_team_allocation')) return

    let step = query.data === 'launch_team_allocation_add' ? 'add' : 'continue'
    if (step === 'add' && form.values.teamAllocation.length >= 10) {
      bot.sendMessage(
        chatId,
        'Maximum of 10 team allocations reached. Please continue to the next steps.',
      )
      step = 'continue'
      return
    }

    if (step === 'add') {
      launchForm.setActiveField(chatId, 'teamAllocationAmount')

      bot.sendMessage(chatId, `Please provide the amount of tokens to allocate to the team member.`)
    }

    if (step === 'continue') {
      if (form.values.teamAllocation.length > 0) {
        const loadingMsg = await bot.sendMessage(chatId, 'Loading...')

        const rawToken = await getTokenData(form.values.address)
        const token = await parseTokenData(form.values.address, rawToken)
        if (!token) return

        await bot.deleteMessage(chatId, loadingMsg.message_id)

        const totalTeamAllocation =
          BigInt(
            form.values.teamAllocation.reduce((acc, allocation) => acc + allocation.amount, 0),
          ) * BigInt(decimalsScale(DECIMALS))

        if (totalTeamAllocation > BigInt(token.totalSupply)) {
          await bot.sendMessage(
            chatId,
            dedent`
              Total team allocation exceeds the total supply of the token. Team allocations discarded. Please start over.
              *Total Supply*: ${BigInt(token.totalSupply) / BigInt(decimalsScale(DECIMALS))}
              *Total Team Allocation*: ${totalTeamAllocation / BigInt(decimalsScale(DECIMALS))}
            `.trim(),
            { parse_mode: 'Markdown' },
          )

          launchForm.resetForm(chatId)
          return
        }

        await bot.sendMessage(
          chatId,
          dedent`
            ${form.values.teamAllocation.length} team allocations added. All team allocations:
            ${form.values.teamAllocation
              .map((team) =>
                dedent`
                  *  Amount*: ${team.amount}
                  *  Address*: ${team.holderAddress}
                `.trim(),
              )
              .join('\n\n')}
          `,
          { parse_mode: 'Markdown' },
        )
      }

      launchForm.setActiveField(chatId, 'holdLimit')

      bot.sendMessage(
        chatId,
        `Please provide the hold limit between 0.5% and 100%. (1% recommended)`,
      )
    }
  }

  if (form?.activeField === 'launch') {
    if (query.data === 'launch_launch_cancel') {
      bot.sendMessage(chatId, 'Launch cancelled and all data has been discarded.')
      formState.resetForm(chatId)
    }

    if (query.data === 'launch_launch_confirm') {
      switch (form.values.amm) {
        case 'ekubo':
          launchOnEkubo(form)
          break

        case 'jediswap':
        case 'starkdefi':
          launchOnStandardAMM(form)
          break
      }
    }
  }
})

const launchOnEkubo = async (form: ReturnType<typeof launchForm.getForm>) => {
  //
}

const launchOnStandardAMM = async (form: ReturnType<typeof launchForm.getForm>) => {
  //
}
