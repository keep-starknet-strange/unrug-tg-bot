import TelegramBot from 'node-telegram-bot-api'
import { BlockNumber, BlockTag, CallContractResponse, CallData, RpcProvider, getChecksumAddress, hash, shortString, uint256 } from 'starknet'
import { DECIMALS, FACTORY_ADDRESS, JEDISWAP_ETH_USDC, LIQUIDITY_LOCK_FOREVER_TIMESTAMP, LiquidityType, MULTICALL_ADDRESS, QUOTE_TOKENS, Selector } from './constants'
import { EkuboMemecoin, JediswapMemecoin, LaunchedMemecoin, Memecoin } from './types'
import { Fraction, Percent } from '@uniswap/sdk-core'
import { formatPercentage } from './utils'
import { getInitialPrice } from './ekubo'

const bot = getBot()
const provider = getProvider()

console.log("Bot is running...")

// ************ COMMANDS ************

// /unrug command
// Matches "/unrug [token_address]"
bot.onText(/\/unrug (.+)/, (msg, match) => {
  // TODO: add usage
  if (!match?.[1]) return

  // 'msg' is the received Message from Telegram
  // 'match' is the result of executing the regexp above on the text content
  // of the message

  const chatId = msg.chat.id
  const tokenAddress = match[1] // the captured "token_address"

  computeResponse(chatId, tokenAddress)
    .then((response) => {
      // handle response
      console.log(response)
      bot.sendMessage(chatId, response)
    })
})

async function computeResponse(chatId: number, tokenAddress: string): Promise<string> {

  // Check if the provided address is a valid StarnNet address
  if (!isValidStarknetAddress(tokenAddress)) {
    return `The provided address is a not valid Starknet address: ${tokenAddress}`
  } else {
    // Display loading message
    bot.sendMessage(chatId, 'Loading...')

    try {
      const rawMemecoin = await getTokenData(tokenAddress)
      const memecoin = await parseTokenData(tokenAddress, rawMemecoin)

      if (!memecoin) {
        return 'This token is Ruggable ❌'
      }

      let response = `This token IS Unruggable ✅\n\n` +
        `Token name: ${memecoin.name}\n` +
        `Token symbol: $${memecoin.symbol}\n`

      if (!memecoin.isLaunched) {
        response += '\nNot launched yet.'
      } else {
        // team allocation
        const teamAllocation = new Percent(memecoin.launch.teamAllocation, memecoin.totalSupply)
        const parsedTeamAllocation = formatPercentage(teamAllocation)

        response += `Team alloc: ${parsedTeamAllocation}\n`

        // Liquidity
        const { parsedStartingMcap, isQuoteTokenSafe } = await parseLiquidityParams(memecoin)
        if (!isQuoteTokenSafe) {
          return 'This token is Ruggable ❌ (unknown quote token)'
        }

        response += `Starting mcap: ${parsedStartingMcap}\n`
      }

      return response
    } catch (_err) {
      return 'This token is Ruggable ❌'
    }
  }
}

// ************ FUNCTIONS ************

/**
 * Returns a Telegram bot instance.
 *
 * @returns A Telegram bot instance.
 */
function getBot(): TelegramBot {
  // replace the value below with the Telegram token you receive from @BotFather
  const telegramBotToken = Bun.env.TELEGRAM_BOT_TOKEN

  // Exit if the token is not provided
  if (!telegramBotToken) {
    console.error("TELEGRAM_BOT_TOKEN is not provided")
    process.exit(1)
  }

  return new TelegramBot(telegramBotToken, { polling: true })
}

/**
 * Returns a Starknet RPC Provider instance.
 *
 * @returns A Starknet RPC Provider instance.
 */
function getProvider(): RpcProvider {
  // replace the value below with the Telegram token you receive from @BotFather
  const nodeUrl = Bun.env.NODE_URL

  // Exit if the node url is not provided
  if (!nodeUrl) {
    console.error("NODE_URL is not provided")
    process.exit(1)
  }

  return new RpcProvider({ nodeUrl })
}

/**
 * Checks if a given string is a valid StarkNet address.
 *
 * A valid StarkNet address must start with '0x' followed by 63 or 64 hexadecimal characters.
 *
 * @param address - The string to be tested against the StarkNet address format.
 * @returns `true` if the string is a valid StarkNet address, otherwise `false`.
 */
function isValidStarknetAddress(address: string): boolean {
  const regex = /^0x[0-9a-fA-F]{50,64}$/
  return regex.test(address)
}

const decimalsScale = (decimals: number) => `1${Array(decimals).fill('0').join('')}`


// ************ MEMECOIN DATA ************

async function getTokenData(tokenAddress: string) {
  const isMemecoinCalldata = CallData.compile({
    to: FACTORY_ADDRESS,
    selector: hash.getSelector(Selector.IS_MEMECOIN),
    calldata: [tokenAddress],
  })

  const nameCalldata = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.NAME),
    calldata: [],
  })

  const symbolCalldata = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.SYMBOL),
    calldata: [],
  })

  const launchedCalldata = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.IS_LAUNCHED),
    calldata: [],
  })

  const totalSupplyCalldata = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.TOTAL_SUPPLY),
    calldata: [],
  })

  const teamAllocationCalldata = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.GET_TEAM_ALLOCATION),
    calldata: [],
  })

  const ownerCalldata = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.OWNER),
    calldata: [],
  })

  const lockedLiquidity = CallData.compile({
    to: FACTORY_ADDRESS,
    selector: hash.getSelector(Selector.LOCKED_LIQUIDITY),
    calldata: [tokenAddress],
  })

  const launchBlock = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.LAUNCHED_AT_BLOCK_NUMBER),
    calldata: [],
  })

  const launchParams = CallData.compile({
    to: tokenAddress,
    selector: hash.getSelector(Selector.LAUNCHED_WITH_LIQUIDITY_PARAMETERS),
    calldata: [],
  })

  return provider.callContract({
    contractAddress: MULTICALL_ADDRESS,
    entrypoint: Selector.AGGREGATE,
    calldata: [
      10,
      ...isMemecoinCalldata,
      ...nameCalldata,
      ...symbolCalldata,
      ...launchedCalldata,
      ...totalSupplyCalldata,
      ...teamAllocationCalldata,
      ...ownerCalldata,
      ...lockedLiquidity,
      ...launchBlock,
      ...launchParams,
    ],
  })
}

async function parseTokenData(tokenAddress: string, res: CallContractResponse): Promise<Memecoin | null> {
  const isUnruggable = !!+res.result[3] // beautiful

  if (!isUnruggable) return null

  const hasLiquidity = !+res.result[19] // even more beautiful
  const hasLaunchParams = !+res.result[26] // I'm delighted

  const isLaunched = !!+res.result[9] && hasLiquidity && hasLaunchParams // meh...

  const baseMemecoin = {
    address: tokenAddress,
    name: shortString.decodeShortString(res.result[5]),
    symbol: shortString.decodeShortString(res.result[7]),
    totalSupply: uint256.uint256ToBN({ low: res.result[11], high: res.result[12] }).toString(),
    owner: getChecksumAddress(res.result[17]),
  }

  if (isLaunched) {
    const launch = {
      teamAllocation: uint256.uint256ToBN({ low: res.result[14], high: res.result[15] }).toString(),
      blockNumber: +res.result[24],
    }

    const liquidityType = Object.values(LiquidityType)[+res.result[21]] as LiquidityType

    const lockManager = res.result[20] as string

    switch (liquidityType) {
      case LiquidityType.STARKDEFI_ERC20:
      case LiquidityType.JEDISWAP_ERC20: {
        const liquidity = {
          type: liquidityType,
          lockManager,
          lockPosition: res.result[31],
          quoteToken: getChecksumAddress(res.result[28]),
          quoteAmount: uint256.uint256ToBN({ low: res.result[29], high: res.result[30] }).toString(),
        } as const

        return {
          ...baseMemecoin,
          isLaunched: true,
          launch,
          liquidity: {
            ...liquidity,
            ...(await getJediswapLiquidityLockPosition(liquidity)),
          },
        }
      }

      case LiquidityType.EKUBO_NFT: {
        const liquidity = {
          type: LiquidityType.EKUBO_NFT,
          lockManager,
          ekuboId: res.result[22],
          quoteToken: getChecksumAddress(res.result[33]),
          startingTick: +res.result[30] * (+res.result[31] ? -1 : 1), // mag * sign
        } as const

        return {
          ...baseMemecoin,
          isLaunched: true,
          launch,
          liquidity: {
            ...liquidity,
            ...(await getEkuboLiquidityLockPosition(liquidity)),
          },
        }
      }
    }
  } else {
    return { ...baseMemecoin, isLaunched: false }
  }
}

// ************ LIQUDITY ************

async function getJediswapLiquidityLockPosition(liquidity: Pick<JediswapMemecoin['liquidity'], 'lockPosition' | 'lockManager'>) {
  return provider.callContract({
    contractAddress: liquidity.lockManager,
    entrypoint: Selector.GET_LOCK_DETAILS,
    calldata: [liquidity.lockPosition],
  })
  .then((res) => {
    return {
      unlockTime: +res.result[4],
      owner: res.result[3],
    }
  })
}

async function getEkuboLiquidityLockPosition(liquidity: Pick<EkuboMemecoin['liquidity'], 'ekuboId' | 'lockManager'>) {
  return provider
    .callContract({
      contractAddress: liquidity.lockManager,
      entrypoint: Selector.LIQUIDITY_POSITION_DETAILS,
      calldata: [liquidity.ekuboId],
    })
    .then((res) => {
      return {
        unlockTime: LIQUIDITY_LOCK_FOREVER_TIMESTAMP,
        owner: res.result[0],
        // pool key
        poolKey: {
          token0: res.result[2],
          token1: res.result[3],
          fee: res.result[4],
          tickSpacing: res.result[5],
          extension: res.result[6],
        },
        bounds: {
          lower: {
            mag: res.result[7],
            sign: res.result[8],
          },
          upper: {
            mag: res.result[9],
            sign: res.result[10],
          },
        },
      }
    })
}

// ************ ETH PRICE ************

async function getEtherPrice(blockIdentifier: BlockNumber = BlockTag.latest) {
  return provider
    .callContract({
      contractAddress: JEDISWAP_ETH_USDC,
      entrypoint: Selector.GET_RESERVES,
      calldata: [],
    }, blockIdentifier)
    .then((res) => {
      const reserve0 = { low: res.result[0], high: res.result[1] }
      const reserve1 = { low: res.result[2], high: res.result[3] }

      return new Fraction(
        uint256.uint256ToBN(reserve1).toString(),
        uint256.uint256ToBN(reserve0).toString()
      ).multiply(decimalsScale(12))
    })
}

// ************ LIQUIDITY PARAMS PARSING ************

async function parseLiquidityParams(memecoin: LaunchedMemecoin) {
  // quote token
  const quoteTokenInfos = QUOTE_TOKENS[memecoin.liquidity.quoteToken]
  const isQuoteTokenSafe = !!quoteTokenInfos

  // starting mcap
  const ethPriceAtLaunch = await getEtherPrice(memecoin.launch.blockNumber)
  let startingMcap: Fraction | undefined

  switch (memecoin.liquidity.type) {
    case LiquidityType.STARKDEFI_ERC20:
    case LiquidityType.JEDISWAP_ERC20: {
      startingMcap =
        isQuoteTokenSafe
          ? new Fraction(memecoin.liquidity.quoteAmount)
              .multiply(new Fraction(memecoin.launch.teamAllocation, memecoin.totalSupply).add(1))
              .divide(decimalsScale(DECIMALS))
              .multiply(ethPriceAtLaunch)
          : undefined

      break
    }

    case LiquidityType.EKUBO_NFT: {
      const initialPrice = getInitialPrice(memecoin.liquidity.startingTick)
      startingMcap =
        isQuoteTokenSafe
          ? new Fraction(Math.round(initialPrice * +decimalsScale(DECIMALS)), decimalsScale(DECIMALS))
              .multiply(ethPriceAtLaunch)
              .multiply(memecoin.totalSupply)
              .divide(decimalsScale(DECIMALS))
          : undefined
    }
  }

  const parsedStartingMcap = startingMcap ? `$${startingMcap.toFixed(0, { groupSeparator: ',' })}` : 'UNKNOWN'

  return {
    isQuoteTokenSafe,
    parsedStartingMcap
  }
}
