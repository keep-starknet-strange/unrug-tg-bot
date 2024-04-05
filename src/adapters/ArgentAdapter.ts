import { SignClient } from '@walletconnect/sign-client'
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

  protected get chainNamespace(): string {
    // Removing the underscore from SN_ prefix from the chain name
    return `${this.namespace}:${this.chain.replace(/^SN_/, 'SN')}`
  }

  public async init(): Promise<void> {
    if (!Bun.env.WC_PROJECT_ID) {
      throw new Error(
        'WC_PROJECT_ID env variable is not provided. You can get one from https://cloud.walletconnect.com',
      )
    }

    this.signClient = await SignClient.init({
      projectId: Bun.env.WC_PROJECT_ID,
      metadata: {
        name: 'Unruggable Meme',
        description: 'Unruggable Meme Telegram Bot',
        url: '#',
        icons: [],
      },
    })

    this.signClient.on('session_event', (...args: any[]) => {
      console.log('session_event', args)
    })

    this.signClient.on('session_update', (...args: any[]) => {
      console.log('session_update', args)
    })

    this.signClient.on('session_delete', (...args: any[]) => {
      console.log('session_delete', args)
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
      // TODO: Replace example.com with the actual URL
      const buttonUrl = `https://example.com/?wc=${encodeURIComponent(uri)}`

      const waitForApproval = async (): Promise<ConnectWaitForApprovalReturnType> => {
        const result = await approval()

        const accounts = result.namespaces[this.namespace].accounts

        if (accounts.length === 0) {
          return {
            error: 'no_accounts_connected',
          }
        }

        // Connected accounts are prefixed with the chain and namespace
        // Example: "starknet:SNMAIN:0x028446b7625a071bd169022ee8c77c1aad1e13d40994f54b2d84f8cde6aa458d"
        // Since we're only connecting for a single chain, we can remove the chain prefix
        const connectedAccounts = accounts.map((account: string) =>
          account.replace(`${this.chainNamespace}:`, ''),
        )

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

  public onDisconnect(onDisconnect: (data: OnDisconnectType) => void): void {
    if (!this.signClient) {
      throw new Error('Adapter not initialized')
    }

    this.signClient.on('session_delete', onDisconnect)
  }
}
