import QRCode from 'qrcode'
import { constants } from 'starknet'

import { adapters } from '../adapters'
import { BaseAdapter } from '../adapters/BaseAdapter'
import { adapterStorage } from '../utils/storage'
import { bot } from './bot'

export const useWallet = async <TAdaptor extends keyof typeof adapters>(
  chatId: number,
  adapter: TAdaptor,
  onConnect: (adapter: BaseAdapter) => void | Promise<void>,
): Promise<void> => {
  if (!chatId) return

  const existing = adapterStorage.getAdapter(chatId)
  if (existing && existing.connected) {
    onConnect(existing)
    return
  }

  try {
    const Adapter = adapters[adapter]
    const newAdapter = new Adapter({ chain: constants.NetworkName.SN_MAIN })
    await newAdapter.init()

    newAdapter.onDisconnect(() => {
      adapterStorage.removeAdapter(chatId)
    })

    adapterStorage.addAdapter(chatId, newAdapter)

    const connectResult = await newAdapter.connect()
    if ('error' in connectResult) {
      adapterStorage.removeAdapter(chatId)
      // No need to send a message here, this error is only can be user rejected or timeout
      return
    }

    const { qrUrl, buttonUrl, waitForApproval } = connectResult

    const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 256 })

    const connectMsg = await bot.sendPhoto(
      chatId,
      qrBuffer,
      {
        caption: 'Scan the QR code or click the button below to connect your wallet',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'Click To Connect',
                url: buttonUrl,
              },
            ],
          ],
        },
      },
      {
        filename: 'connect_qr',
      },
    )

    const result = await waitForApproval()
    if ('error' in result) {
      if (result.error === 'no_accounts_connected') {
        bot.sendMessage(chatId, 'No accounts connected to wallet')
      } else if (result.error === 'wrong_chain') {
        bot.sendMessage(chatId, 'Wrong chain selected. Please switch to Starknet Mainnet')
      } else if (result.error === 'unknown_error') {
        bot.sendMessage(chatId, 'Failed to connect to wallet')
      }

      bot.deleteMessage(connectMsg.chat.id, connectMsg.message_id)
      return
    }

    const { accounts } = result

    bot.sendMessage(chatId, `Connected to wallet with account: ${accounts[0]}`)
    bot.deleteMessage(connectMsg.chat.id, connectMsg.message_id)
    onConnect(newAdapter)
  } catch (e) {
    bot.sendMessage(chatId, 'Failed to connect to wallet')
  }
}
