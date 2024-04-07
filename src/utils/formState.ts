import { AMMs } from './constants'

export type Forms = {
  deploy: {
    name?: string
    symbol?: string
    ownerAddress?: string
    initialSupply?: number
    deploy: undefined
  }
  launch: {
    address: string
    amm?: keyof typeof AMMs

    teamAllocation: {
      holderAddress: string
      amount: number
    }[]
    teamAllocationAmount?: number
    teamAllocationAddress?: string

    holdLimit?: number
    disableAntibotAfter?: number
    startingMarketCap?: number

    ekuboFees?: number
    lockLiquidity?: number

    launch: undefined
  }
}

const defaultValues: Forms = {
  deploy: {
    name: undefined,
    symbol: undefined,
    ownerAddress: undefined,
    initialSupply: undefined,
    deploy: undefined,
  },
  launch: {
    address: '',
    amm: undefined,

    teamAllocation: [],
    teamAllocationAmount: undefined,
    teamAllocationAddress: undefined,

    holdLimit: undefined,
    disableAntibotAfter: undefined,
    startingMarketCap: undefined,

    ekuboFees: undefined,
    lockLiquidity: undefined,

    launch: undefined,
  },
}

class FormState<FormKeys extends keyof Forms> {
  public forms: Record<
    // Chat ID
    number,
    | {
        activeForm?: FormKeys
        activeField: keyof Forms[FormKeys] | undefined
        values: Forms[FormKeys]
      }
    | undefined
  > = {}

  public resetForm = (chatId: number) => {
    delete this.forms[chatId]
  }

  public setActiveForm = (chatId: number, form: FormKeys) => {
    this.forms[chatId] = {
      activeForm: form,
      activeField: undefined,
      values: defaultValues[form],
    }
  }

  public setActiveField = (chatId: number, field: keyof Forms[FormKeys] | undefined) => {
    if (!this.forms[chatId]) return

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.forms[chatId]!.activeField = field
  }

  public setValue = <TField extends keyof Forms[FormKeys]>(
    chatId: number,
    field: TField,
    value: Forms[FormKeys][TField],
  ) => {
    if (!this.forms[chatId]) return

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.forms[chatId]!.values[field] = value
  }

  public getForm = (chatId: number) => {
    return this.forms[chatId]
  }
}

export const formState = new FormState()
export const deployForm = formState as FormState<'deploy'>
export const launchForm = formState as FormState<'launch'>
