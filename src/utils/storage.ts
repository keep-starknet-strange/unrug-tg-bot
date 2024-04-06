import { BaseAdapter } from '../adapters/BaseAdapter'

export const adapterStorage = new (class AdapterStorage {
  public adapters: Record<number, BaseAdapter> = {}

  public addAdapter = (key: number, adapter: BaseAdapter): void => {
    this.adapters[key] = adapter
  }

  public removeAdapter = (key: number): void => {
    delete this.adapters[key]
  }

  public getAdapter = (key: number): BaseAdapter | undefined => {
    return this.adapters[key]
  }
})()
