import { App, PluginSettingTab, Setting } from 'obsidian'
import { BASE_URL } from './bookfusion_api'
import { BookFusionPlugin } from './plugin'

export class BookFusionSettingsTab extends PluginSettingTab {
  plugin: BookFusionPlugin

  constructor (app: App, plugin: BookFusionPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display (): void {
    this.containerEl.empty()

    if (this.plugin.settings.token == null) {
      this.displayStartStage()
    } else {
      this.displayReadyStage()
    }
  }

  private displayStartStage (): void {
    new Setting(this.containerEl)
      .setName('Connect Obsidian to BookFusion')
      .setDesc('Requires BookFusion account')
      .addButton((buttonComponent) => {
        buttonComponent
          .setButtonText('Connect')
          .setCta()
          .onClick(this.connect.bind(this))
      })
  }

  private displayReadyStage (): void {
    new Setting(this.containerEl)
      .setName('Obsidian is connected to BookFusion')
      .addButton((buttonComponent) => {
        buttonComponent
          .setCta()
          .setIcon('settings')
          .onClick(this.openSettingsPage.bind(this))
      })
      .addButton((buttonComponent) => {
        buttonComponent
          .setButtonText('Disconnect')
          .onClick(this.disconnect.bind(this))
      })

    new Setting(this.containerEl)
      .setName('Clear synchronization state')
      .addButton((buttonComponent) => {
        buttonComponent.setIcon('trash')

        if (this.plugin.settings.cursor == null) {
          buttonComponent
            .setDisabled(true)
            .setClass('mod-muted')
        } else {
          buttonComponent
            .setWarning()
            .onClick(this.clearSyncState.bind(this))
        }
      })
  }

  private connect (): void {
    window.open(new URL('/obsidian-api/connect', BASE_URL))
  }

  private async openSettingsPage (): Promise<undefined> {
    const url = new URL('/obsidian-api/connect', BASE_URL)
    url.searchParams.set('token', String(this.plugin.settings.token))
    window.open(url)
  }

  private async disconnect (): Promise<undefined> {
    this.plugin.settings.token = null
    await this.plugin.saveSettings()
    this.display()
  }

  private async clearSyncState (): Promise<void> {
    this.plugin.settings.cursor = null
    await this.plugin.saveSettings()
    this.display()
  }
}
