import dedent from 'ts-dedent'

import { bot } from '../services/bot'
import { isValidL2Address } from '../utils/address'
import { AMMs } from '../utils/constants'
import { formState, launchForm } from '../utils/formState'

const validateTeamAllocationAmount = (
  amount: number | undefined,
  maxSupply: number,
  chatId: number,
): amount is number => {
  if (amount === undefined || isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, `The *Amount* is invalid. Please provide a valid number.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  if (amount > maxSupply) {
    bot.sendMessage(
      chatId,
      `The *Amount* is exceeding the total available supply. Please provide a smaller number. Current available supply: ${maxSupply}`,
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

const validateHoldLimit = (
  percentage: number | undefined,
  chatId: number,
): percentage is number => {
  if (percentage === undefined || isNaN(percentage)) {
    bot.sendMessage(chatId, `*Hold limit* is invalid. Please provide a valid number.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  if (percentage < 0.5) {
    bot.sendMessage(chatId, `*Hold limit* cannot fall behind 0.5%`, { parse_mode: 'Markdown' })
    return false
  }

  if (percentage > 100) {
    bot.sendMessage(chatId, `*Hold limit* cannot exceed 100%`, { parse_mode: 'Markdown' })
    return false
  }

  return true
}

const validateDisableAfter = (time: string | undefined, chatId: number): time is string => {
  if (!time || !/^[0-9]{1,2}:[0-9]{1,2}$/.test(time)) {
    bot.sendMessage(
      chatId,
      `*Disable after* time is invalid. Please provide a valid time in the format hh:mm. Example: 00:30`,
      {
        parse_mode: 'Markdown',
      },
    )
    return false
  }

  const [hours, minutes] = time.split(':').map((part) => parseInt(part, 10)) || []
  const total = hours * 60 + minutes

  if (total > 24 * 60) {
    bot.sendMessage(chatId, `*Disable after* time should be less than 24 hours.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  if (total < 30) {
    bot.sendMessage(chatId, `*Disable after* time should be at least 00:30.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  return true
}

const validateStartingMarketCap = (
  amount: number | undefined,
  chatId: number,
): amount is number => {
  if (amount === undefined || isNaN(amount) || amount <= 0) {
    bot.sendMessage(chatId, `*Starting Market Cap* is invalid. Please provide a valid number.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  return true
}

const validateEkuboFees = (
  percentage: number | undefined,
  chatId: number,
): percentage is number => {
  if (percentage === undefined || isNaN(percentage)) {
    bot.sendMessage(chatId, `*Ekubo Fees* is invalid. Please provide a valid number.`, {
      parse_mode: 'Markdown',
    })
    return false
  }

  if (percentage < 0.01) {
    bot.sendMessage(chatId, `*Ekubo Fees* cannot fall behind 0.01%`, { parse_mode: 'Markdown' })
    return false
  }

  if (percentage > 2) {
    bot.sendMessage(chatId, `*Ekubo Fees* cannot exceed 2%`, { parse_mode: 'Markdown' })
    return false
  }

  return true
}

const validateLockLiquidity = (months: number | undefined, chatId: number): months is number => {
  if (months === Infinity) return true

  if (months === undefined || isNaN(months) || months <= 0 || months > 24 || months < 6) {
    bot.sendMessage(
      chatId,
      `*Lock Liquidity* is invalid. Please provide a valid number between 6 and 24, or type *forever* for permanent lock.`,
      { parse_mode: 'Markdown' },
    )
    return false
  }

  return true
}

bot.onText(/\/launch/, async (msg): Promise<void> => {
  if (msg.chat.type !== 'private') {
    bot.sendMessage(msg.chat.id, 'This command can only be used in a private chat.')
    return
  }

  formState.resetForm(msg.chat.id)

  let ammMessage =
    "Hi there! Let's launch your meme coin! Please choose an AMM to launch your token."
  Object.values(AMMs).forEach((amm) => {
    ammMessage += `\n\n*${amm.name}*: ${amm.description}`
  })

  await bot.sendMessage(msg.chat.id, ammMessage, {
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

  formState.setActiveForm(msg.chat.id, 'launch')
  launchForm.setActiveField(msg.chat.id, 'amm')
})

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return
  const chatId = msg.chat.id

  const form = launchForm.getForm(chatId)
  if (form?.activeForm !== 'launch') return

  const activeField = form?.activeField

  if (activeField === 'teamAllocationAmount') {
    const amount = parseInt(msg.text.replace(/[^0-9]/g, ''), 10)

    // TODO: get the max available supply
    if (!validateTeamAllocationAmount(amount, 1, chatId)) return

    launchForm.setValue(chatId, 'teamAllocationAmount', amount)
    launchForm.setActiveField(chatId, 'teamAllocationAddress')

    bot.sendMessage(msg.chat.id, `Please provide the address of the team member.`)
  }

  if (activeField === 'teamAllocationAddress') {
    if (!validateAddress(msg.text, chatId)) return

    launchForm.setValue(chatId, 'teamAllocation', [
      ...form.values.teamAllocation,
      {
        holderAddress: msg.text,

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
    const percentage = parseFloat(msg.text)
    if (!validateHoldLimit(percentage, chatId)) return

    launchForm.setValue(chatId, 'holdLimit', percentage)
    launchForm.setActiveField(chatId, 'disableAntibotAfter')

    bot.sendMessage(
      msg.chat.id,
      `When should the anti bot features be disabled? Between 00:30 - 24:00 (hh:mm format, e.g. 12:30)`,
    )
  }

  if (activeField === 'disableAntibotAfter') {
    if (!validateDisableAfter(msg.text, chatId)) return

    const [hours, minutes] = msg.text.split(':').map((part) => parseInt(part, 10)) || []
    const time = hours * 60 + minutes

    launchForm.setValue(chatId, 'disableAntibotAfter', time)
    launchForm.setActiveField(chatId, 'startingMarketCap')

    bot.sendMessage(
      chatId,
      `Please provide the starting market cap (in USD) of the token. (10.000$ Recommended)`,
    )
  }

  if (activeField === 'startingMarketCap') {
    const amount = parseInt(msg.text.replace(/[^0-9]/g, ''), 10)
    if (!validateStartingMarketCap(amount, chatId)) return

    launchForm.setValue(chatId, 'startingMarketCap', amount)

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
      const percentage = parseFloat(msg.text)
      if (!validateEkuboFees(percentage, chatId)) return

      launchForm.setValue(chatId, 'ekuboFees', percentage)
    }

    if (activeField === 'lockLiquidity') {
      const lockLiquidity =
        msg.text.toLowerCase().trim() === 'forever'
          ? Infinity
          : parseInt(msg.text.replace(/[^0-9]/g, ''), 10)

      if (!validateLockLiquidity(lockLiquidity, chatId)) return

      launchForm.setValue(chatId, 'lockLiquidity', lockLiquidity)
    }

    launchForm.setActiveField(chatId, 'launch')

    /* eslint-disable @typescript-eslint/no-non-null-assertion */
    const { disableAntibotAfter } = form.values
    const disableAfter = `${Math.floor(disableAntibotAfter! / 60)}:${disableAntibotAfter! % 60}`

    let message = "Here's a summary of the data you've provided:\n"
    message += `*AMM*: ${AMMs[form.values.amm!].name}\n`
    message += `*Team Allocations*:\n`

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

    bot.sendMessage(chatId, message.trim(), { parse_mode: 'Markdown' })
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

      launchForm.setActiveField(chatId, 'holdLimit')

      bot.sendMessage(
        chatId,
        `Please provide the hold limit between 0.5% and 100%. (1% recommended)`,
      )
    }
  }
})
