import { BaseAdapterConstructorOptions } from './BaseAdapter'
import { BaseWCAdapter } from './BaseWCAdapter'

export class ArgentAdapter extends BaseWCAdapter {
  public constructor(options: BaseAdapterConstructorOptions) {
    super(options)
  }

  protected getQRUrl(uri: string): string {
    return `argent://app/wc?uri=${encodeURIComponent(uri)}&device=mobile`
  }

  protected getButtonUrl(uri: string): string {
    return `https://unruggable.meme/wallet-redirect/${encodeURIComponent(this.getQRUrl(uri))}`
  }
}
