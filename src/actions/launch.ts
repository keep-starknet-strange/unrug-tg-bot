import { Fraction, Percent } from '@uniswap/sdk-core'
import { CallData, uint256 } from 'starknet'

import { BaseAdapter } from '../adapters/BaseAdapter'
import {
  AMMs,
  DECIMALS,
  EKUBO_BOUND,
  EKUBO_FEES_MULTIPLICATOR,
  EKUBO_TICK_SPACING,
  ETH_ADDRESS,
  FACTORY_ADDRESS,
  LIQUIDITY_LOCK_FOREVER_TIMESTAMP,
  Selector,
  STARKNET_MAX_BLOCK_TIME,
} from '../utils/constants'
import { getStartingTick } from '../utils/ekubo'
import { launchForm } from '../utils/formState'
import { decimalsScale, parsePercentage } from '../utils/helpers'
import { getEtherPrice } from '../utils/price'
import { getMemecoin } from './memecoinData'

type FormData = Required<NonNullable<ReturnType<typeof launchForm.getForm>>['values']>

export async function launchOnEkubo(adapter: BaseAdapter, account: string, data: FormData) {
  const memecoin = await getMemecoin(data.address)
  if (!memecoin) {
    return {
      error: 'Memecoin not found',
    }
  }

  const quoteTokenPrice = await getEtherPrice()
  const quoteTokenAddress = ETH_ADDRESS

  const teamAllocationFraction = data.teamAllocation.reduce((acc, { amount }) => acc.add(amount), new Fraction(0))
  const teamAllocationPercentage = new Percent(
    teamAllocationFraction.quotient,
    new Fraction(memecoin?.totalSupply, decimalsScale(DECIMALS)).quotient,
  )
  const teamAllocationQuoteAmount = new Fraction(data.startingMarketCap)
    .divide(quoteTokenPrice)
    .multiply(teamAllocationPercentage.multiply(parsePercentage(data.ekuboFees).add(1)))
  const uin256TeamAllocationQuoteAmount = uint256.bnToUint256(
    BigInt(teamAllocationQuoteAmount.multiply(decimalsScale(DECIMALS)).quotient.toString()),
  )

  const initialPrice = +new Fraction(data.startingMarketCap)
    .divide(quoteTokenPrice)
    .multiply(decimalsScale(DECIMALS))
    .divide(new Fraction(memecoin.totalSupply))
    .toFixed(DECIMALS)
  const startingTickMag = getStartingTick(initialPrice)
  const i129StartingTick = {
    mag: Math.abs(startingTickMag),
    sign: startingTickMag < 0,
  }

  const fees = parsePercentage(data.ekuboFees).multiply(EKUBO_FEES_MULTIPLICATOR).quotient.toString()

  const transferCalldata = CallData.compile([
    FACTORY_ADDRESS, // recipient
    uin256TeamAllocationQuoteAmount, // amount
  ])

  const initialHolders = data.teamAllocation.map(({ holderAddress }) => holderAddress)
  const initialHoldersAmounts = data.teamAllocation.map(({ amount }) =>
    uint256.bnToUint256(BigInt(amount) * BigInt(decimalsScale(DECIMALS))),
  )

  const launchCalldata = CallData.compile([
    data.address, // memecoin address
    data.disableAntibotAfter * 60, // anti bot period in seconds
    data.holdLimit * 100, // hold limit
    quoteTokenAddress, // quote token address
    initialHolders, // initial holders
    initialHoldersAmounts, // initial holders amounts
    fees, // ekubo fees
    EKUBO_TICK_SPACING, // tick spacing
    i129StartingTick, // starting tick
    EKUBO_BOUND, // bound
  ])

  const result = await adapter.invokeTransaction({
    accountAddress: account,
    executionRequest: {
      calls: [
        {
          contractAddress: quoteTokenAddress,
          entrypoint: Selector.TRANSFER,
          calldata: transferCalldata,
        },
        {
          contractAddress: FACTORY_ADDRESS,
          entrypoint: Selector.LAUNCH_ON_EKUBO,
          calldata: launchCalldata,
        },
      ],
    },
  })

  return result
}

export async function launchOnStandardAMM(adapter: BaseAdapter, account: string, data: FormData) {
  const memecoin = await getMemecoin(data.address)
  if (!memecoin) {
    return {
      error: 'Memecoin not found',
    }
  }

  const quoteTokenPrice = await getEtherPrice()
  const quoteTokenAddress = ETH_ADDRESS

  const teamAllocationFraction = data.teamAllocation.reduce((acc, { amount }) => acc.add(amount), new Fraction(0))
  const teamAllocationPercentage = new Percent(
    teamAllocationFraction.quotient,
    new Fraction(memecoin?.totalSupply, decimalsScale(DECIMALS)).quotient,
  )

  const quoteAmount = new Fraction(data.startingMarketCap)
    .divide(quoteTokenPrice)
    .multiply(new Fraction(1).subtract(teamAllocationPercentage))
  const uin256QuoteAmount = uint256.bnToUint256(BigInt(quoteAmount.multiply(decimalsScale(18)).quotient.toString()))

  const initialHolders = data.teamAllocation.map(({ holderAddress }) => holderAddress)
  const initialHoldersAmounts = data.teamAllocation.map(({ amount }) =>
    uint256.bnToUint256(BigInt(amount) * BigInt(decimalsScale(DECIMALS))),
  )

  const currentDate = new Date()
  const liquidityLockPeriod = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth() + data.lockLiquidity ?? 24,
    currentDate.getDate(),
  )

  const approveCalldata = CallData.compile([
    FACTORY_ADDRESS, // spender
    uin256QuoteAmount,
  ])

  const launchCalldata = CallData.compile([
    data.address, // memecoin address
    data.disableAntibotAfter * 60, // anti bot period in seconds
    data.holdLimit * 100, // hodl limit
    quoteTokenAddress, // quote token
    initialHolders, // initial holders
    initialHoldersAmounts, // intial holders amounts
    uin256QuoteAmount, // quote amount
    data.lockLiquidity === Infinity // liquidity lock until
      ? LIQUIDITY_LOCK_FOREVER_TIMESTAMP
      : liquidityLockPeriod.getTime() / 1000 + STARKNET_MAX_BLOCK_TIME,
  ])

  const result = await adapter.invokeTransaction({
    accountAddress: account,
    executionRequest: {
      calls: [
        {
          contractAddress: quoteTokenAddress,
          entrypoint: Selector.APPROVE,
          calldata: approveCalldata,
        },
        {
          contractAddress: FACTORY_ADDRESS,
          entrypoint: AMMs[data.amm].launchEntrypoint,
          calldata: launchCalldata,
        },
      ],
    },
  })

  return result
}
