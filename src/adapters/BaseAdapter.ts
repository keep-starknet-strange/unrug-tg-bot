import { constants } from 'starknet'

export type BaseAdapterConstructorOptions = {
  chain: constants.NetworkName
}

export type ConnectError = 'user_rejected' | 'no_accounts_connected' | 'wrong_chain' | 'timeout' | 'unknown_error'

export type ConnectWaitForApprovalReturnType =
  | { error: ConnectError }
  | {
      topic: string
      accounts: string[]
      chains: constants.NetworkName[]
      methods: string[]
      self: {
        publicKey: string
      }
      peer: {
        publicKey: string
      }
    }

export type ConnectReturnType =
  | { error: ConnectError }
  | {
      qrUrl: string
      buttonUrl: string
      waitForApproval: () => Promise<ConnectWaitForApprovalReturnType>
    }

export type DisconnectReturnType =
  | { error: 'unknown_error' }
  | {
      topic: string
    }

export type RequestParams = {
  method: string
  params: any
}

export type RequestReturnType = { error: 'unknown_error' } | { result: unknown }

export type OnDisconnectType = {
  topic: string
}

export abstract class BaseAdapter {
  public abstract get connected(): boolean

  public abstract get accounts(): string[]

  public abstract init(): Promise<void>

  public abstract connect(): Promise<ConnectReturnType>
  public abstract disconnect(): Promise<DisconnectReturnType>

  public abstract request(params: RequestParams): Promise<RequestReturnType>
  public abstract invokeTransaction(params: object): Promise<RequestReturnType>

  public abstract onDisconnect(onDisconnect: (data: OnDisconnectType) => void): void
}
