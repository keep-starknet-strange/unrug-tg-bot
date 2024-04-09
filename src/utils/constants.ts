import { getChecksumAddress } from 'starknet'

import { getStartingTick } from './ekubo'

export const MULTICALL_ADDRESS = '0x01a33330996310a1e3fa1df5b16c1e07f0491fdd20c441126e02613b948f0225'
export const TOKEN_CLASS_HASH = '0x063ee878d3559583ceae80372c6088140e1180d9893aa65fbefc81f45ddaaa17'
export const FACTORY_ADDRESS = '0x01a46467a9246f45c8c340f1f155266a26a71c07bd55d36e8d1c7d0d438a2dbc'
export const JEDISWAP_ETH_USDC = '0x04d0390b777b424e43839cd1e744799f3de6c176c7e32c1812a41dbd9c19db6a'
export const ETH_ADDRESS = '0x49d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7'

export enum Selector {
  CREATE_MEMECOIN = 'create_memecoin',
  IS_MEMECOIN = 'is_memecoin',
  AGGREGATE = 'aggregate',
  NAME = 'name',
  SYMBOL = 'symbol',
  IS_LAUNCHED = 'is_launched',
  GET_TEAM_ALLOCATION = 'get_team_allocation',
  TOTAL_SUPPLY = 'total_supply',
  OWNER = 'owner',
  LOCKED_LIQUIDITY = 'locked_liquidity',
  LAUNCH_ON_JEDISWAP = 'launch_on_jediswap',
  LAUNCH_ON_EKUBO = 'launch_on_ekubo',
  LAUNCH_ON_STARKDEFI = 'launch_on_starkdefi',
  APPROVE = 'approve',
  GET_REMAINING_TIME = 'get_remaining_time',
  LAUNCHED_WITH_LIQUIDITY_PARAMETERS = 'launched_with_liquidity_parameters',
  GET_LOCK_DETAILS = 'get_lock_details',
  LAUNCHED_AT_BLOCK_NUMBER = 'launched_at_block_number',
  GET_RESERVES = 'get_reserves',
  LIQUIDITY_POSITION_DETAILS = 'liquidity_position_details',
  WITHDRAW_FEES = 'withdraw_fees',
  EXTEND_LOCK = 'extend_lock',
  BALANCE_OF_CAMEL = 'balanceOf',
  BALANCE_OF = 'balance_of',
  TRANSFER = 'transfer',
  GET_TOKEN_INFOS = 'get_token_info',
}

export const LIQUIDITY_LOCK_FOREVER_TIMESTAMP = 9999999999 // 20/11/2286

export const STARKNET_MAX_BLOCK_TIME = 3600 * 2 // 2h

const Ether = {
  address: ETH_ADDRESS,
  symbol: 'ETH',
  decimals: 18,
  camelCased: true,
}

export const QUOTE_TOKENS = {
  [getChecksumAddress(ETH_ADDRESS)]: Ether,
}

export const DECIMALS = 18

export const PERCENTAGE_INPUT_PRECISION = 2

// Ekubo

export const EKUBO_TICK_SIZE = 1.000001
export const EKUBO_TICK_SPACING = 5982 // log(1 + 0.6%) / log(1.000001) => 0.6% is the tick spacing percentage
export const EKUBO_TICK_SIZE_LOG = Math.log(EKUBO_TICK_SIZE)
const EKUBO_MAX_PRICE = '0x100000000000000000000000000000000' // 2 ** 128
export const EKUBO_FEES_MULTIPLICATOR = EKUBO_MAX_PRICE
export const EKUBO_BOUND = getStartingTick(+EKUBO_MAX_PRICE)

// AMMs

export const AMMs = {
  ekubo: {
    name: 'Ekubo',
    description:
      'Most efficient AMM ever, you can launch your token without having to provide liquidity and can collect fees.',
    launchEntrypoint: Selector.LAUNCH_ON_EKUBO,
  },
  jediswap: {
    name: 'Jediswap',
    description:
      "Widely supported AMM, team allocation will be free but you have to provide liquidity and can't collect fees.",
    launchEntrypoint: Selector.LAUNCH_ON_JEDISWAP,
  },
  starkdefi: {
    name: 'StarkDeFi',
    description: "Team allocation will be free but you have to provide liquidity and can't collect fees.",
    launchEntrypoint: Selector.LAUNCH_ON_STARKDEFI,
  },
}
