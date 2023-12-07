import { App, ButtonComponent, Modal } from 'obsidian'

export default class ConfirmationModal extends Modal {
  choiceMade: boolean = false
  message: string
  onPositive: () => void
  onNegative: () => void

  constructor (app: App, message: string) {
    super(app)
    this.message = message
  }

  onOpen (): void {
    this.contentEl.createEl('p', { text: this.message })

    const buttonContainer = this.contentEl.createEl('div', { cls: 'modal-button-container' })

    new ButtonComponent(buttonContainer).setButtonText('Stop').setCta().onClick(() => {
      this.choiceMade = true
      this.close()
      this.onPositive?.()
    })

    new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => {
      this.choiceMade = true
      this.close()
      this.onNegative?.()
    })
  }

  onClose (): void {
    if (!this.choiceMade) {
      this.onNegative?.()
    }

    this.contentEl.empty()
  }
}
