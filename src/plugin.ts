import { Plugin } from 'obsidian'
import { BookFusionPluginSettings, DEFAULT_SETTINGS } from './settings'
import { BookFusionSettingsTab } from './settings_tab'

export class BookFusionPlugin extends Plugin {
  settings: BookFusionPluginSettings

  async onload (): Promise<void> {
    console.log('loading plugin')

    await this.loadSettings()

    const settingsTab = new BookFusionSettingsTab(this.app, this)

    this.addSettingTab(settingsTab)

    this.registerObsidianProtocolHandler('bookfusion-connect', async ({ token }) => {
      this.settings.token = token
      await this.saveSettings()
      settingsTab.display()
    })
  }

  async onunload (): Promise<void> {
    console.log('unloading plugin')
  }

  async loadSettings (): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings (): Promise<void> {
    await this.saveData(this.settings)
  }
}
