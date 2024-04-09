import { SignClient } from '@walletconnect/sign-client'
import type { SessionTypes } from '@walletconnect/types'
import { constants } from 'starknet'

import {
  BaseAdapter,
  BaseAdapterConstructorOptions,
  ConnectReturnType,
  ConnectWaitForApprovalReturnType,
  DisconnectReturnType,
  OnDisconnectType,
  RequestParams,
  RequestReturnType,
} from './BaseAdapter'

export class ArgentAdapter extends BaseAdapter {
  public signClient: Awaited<ReturnType<(typeof SignClient)['init']>> | undefined
  public topic: string | undefined

  public chain: constants.NetworkName
  public namespace = 'starknet'

  public constructor(options: BaseAdapterConstructorOptions) {
    super()

    this.chain = options.chain
  }

  public get connected(): boolean {
    if (!this.signClient) return false

    const validSession = this.signClient.session.getAll().find(this.isValidSession.bind(this))
    if (!validSession) return false

    this.topic = validSession.topic
    return true
  }

  public get accounts(): string[] {
    if (!this.signClient || !this.connected) return []

    const validSession = this.signClient.session.getAll().find(this.isValidSession.bind(this))
    if (!validSession) return []

    return validSession.namespaces[this.namespace].accounts
      .filter((account) => account.startsWith(`${this.chainNamespace}:`))
      .map((account) => account.replace(`${this.chainNamespace}:`, ''))
  }

  protected isValidSession(session: SessionTypes.Struct): boolean {
    if (!this.isValidChains(session)) return false
    if (!this.isValidAccounts(session)) return false

    return true
  }

  protected isValidChains(session: SessionTypes.Struct): boolean {
    return session.requiredNamespaces?.[this.namespace]?.chains?.includes(this.chainNamespace) ?? false
  }

  protected isValidAccounts(session: SessionTypes.Struct): boolean {
    return session.namespaces?.[this.namespace]?.accounts?.some((account) =>
      account.startsWith(`${this.chainNamespace}:`),
    )
  }

  protected get chainNamespace(): string {
    // Removing the underscore from SN_ prefix from the chain name
    return `${this.namespace}:${this.chain.replace(/^SN_/, 'SN')}`
  }

  public async init(): Promise<void> {
    if (!process.env.WC_PROJECT_ID) {
      throw new Error(
        'WC_PROJECT_ID env variable is not provided. You can get one from https://cloud.walletconnect.com',
      )
    }

    this.signClient = await SignClient.init({
      projectId: process.env.WC_PROJECT_ID,
      metadata: {
        name: 'Unruggable Meme',
        description: 'Unruggable Meme Telegram Bot',
        url: 'https://unruggable.meme',
        icons: [
          'https://unruggable.meme/favicon/android-chrome-192x192.png',
          'https://unruggable.meme/favicon/favicon.ico',
        ],
      },
    })
  }

  public async connect(): Promise<ConnectReturnType> {
    if (!this.signClient) {
      throw new Error('Adapter not initialized')
    }

    try {
      const { uri, approval } = await this.signClient.connect({
        requiredNamespaces: {
          starknet: {
            events: ['chainChanged', 'accountsChanged'],
            methods: [
              `${this.namespace}_supportedSpecs`,
              `${this.namespace}_signTypedData`,
              `${this.namespace}_requestAddInvokeTransaction`,
            ],
            chains: [this.chainNamespace],
          },
        },
      })

      if (!uri) {
        return {
          error: 'unknown_error',
        }
      }

      const qrUrl = `argent://app/wc?uri=${encodeURIComponent(uri)}&device=mobile`
      const buttonUrl = `https://unruggable.meme/wallet-redirect/${encodeURIComponent(qrUrl)}`

      const waitForApproval = async (): Promise<ConnectWaitForApprovalReturnType> => {
        const result = await approval()

        // Connected accounts are prefixed with the chain and namespace
        // Example: "starknet:SNMAIN:0x028446b7625a071bd169022ee8c77c1aad1e13d40994f54b2d84f8cde6aa458d"
        // Since we're only connecting for a single chain, we can remove the chain prefix
        const connectedAccounts = result.namespaces[this.namespace].accounts
          .filter((account) => account.startsWith(`${this.chainNamespace}:`))
          .map((account: string) => account.replace(`${this.chainNamespace}:`, ''))

        if (connectedAccounts.length === 0) {
          return {
            error: 'no_accounts_connected',
          }
        }

        if (!this.isValidChains(result)) {
          return {
            error: 'wrong_chain',
          }
        }

        if (!this.isValidSession(result)) {
          return {
            error: 'unknown_error',
          }
        }

        this.topic = result.topic

        return {
          topic: result.topic,
          accounts: connectedAccounts,
          chains: [this.chain],
          methods: result.namespaces[this.namespace].methods,
          self: {
            publicKey: result.self.publicKey,
          },
          peer: {
            publicKey: result.peer.publicKey,
          },
        }
      }

      return {
        qrUrl,
        buttonUrl,
        waitForApproval,
      }
    } catch (_) {
      return {
        error: 'unknown_error',
      }
    }
  }

  public async disconnect(): Promise<DisconnectReturnType> {
    if (!this.signClient) {
      throw new Error('Adapter not initialized')
    }

    if (!this.topic) {
      throw new Error('Adapter not connected to a topic')
    }

    try {
      await this.signClient.disconnect({
        topic: this.topic,
        reason: {
          code: 0,
          message: 'User initiated disconnect',
        },
      })
    } catch (_) {
      return {
        error: 'unknown_error',
      }
    }

    return {
      topic: this.topic,
    }
  }

  public async request(params: RequestParams): Promise<RequestReturnType> {
    if (!this.signClient) {
      throw new Error('Adapter not initialized')
    }

    if (!this.topic) {
      throw new Error('Adapter not connected to a topic')
    }

    try {
      const result = await this.signClient.request({
        topic: this.topic,
        chainId: this.chainNamespace,
        request: {
          method: params.method,
          params: params.params,
        },
      })

      return {
        result,
      }
    } catch (_) {
      return {
        error: 'unknown_error',
      }
    }
  }

  public async invokeTransaction(params: object): Promise<RequestReturnType> {
    return this.request({
      method: `${this.namespace}_requestAddInvokeTransaction`,
      params,
    })
  }

  public onDisconnect(onDisconnect: (data: OnDisconnectType) => void): void {
    if (!this.signClient) {
      throw new Error('Adapter not initialized')
    }

    this.signClient.on('session_delete', onDisconnect)
  }
}
