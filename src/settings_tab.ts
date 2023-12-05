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
          .onClick(async () => {
            window.open(new URL('/obsidian-api/connect', BASE_URL))
          })
      })
  }

  private displayReadyStage (): void {
    new Setting(this.containerEl)
      .setName('Obsidian is connected to BookFusion')
      .addButton((buttonComponent) => {
        buttonComponent
          .setButtonText('Disconnect')
          .onClick(async () => {
            this.plugin.settings.token = null
            await this.plugin.saveSettings()
            this.display()
          })
      })
  }
}
