export const formState = new (class FormState {
  public forms: Record<
    // Chat ID
    number,
    | {
        activeForm?: string
        activeField?: string
        values: Record<string, string>
      }
    | undefined
  > = {}

  public resetForm = (key: number) => {
    delete this.forms[key]
  }

  public setActiveForm = (key: number, form: string) => {
    this.forms[key] = {
      activeForm: form,
      activeField: undefined,
      values: {},
    }
  }

  public setActiveField = (key: number, field: string | undefined) => {
    if (!this.forms[key]) this.setActiveForm(key, 'default')

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.forms[key]!.activeField = field
  }

  public setValue = (key: number, field: string, value: string) => {
    if (!this.forms[key]) this.setActiveForm(key, 'default')

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    this.forms[key]!.values[field] = value
  }

  public getForm = (key: number) => {
    return this.forms[key]
  }
})()
