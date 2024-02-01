import { App, PluginSettingTab, Setting } from 'obsidian'
import { BASE_URL } from './bookfusion_api'
import { BookFusionPlugin } from './plugin'

const INTERVAL_OPTIONS = {
  Manual: 0,
  '30 mins': 30,
  '1 hour': 60,
  '4 hours': 240,
  '12 hours': 720,
  '24 hours': 1440
}

const MS_IN_MINUTE = 60_000

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

    let autoSyncDescription = ''

    if (this.plugin.settings.nextSyncAt != null) {
      const t = new Date(this.plugin.settings.nextSyncAt)
      autoSyncDescription = `The next synchronization will occur at ${t.toLocaleString()}`
    }

    new Setting(this.containerEl)
      .setName('Sync interval')
      .setDesc(autoSyncDescription)
      .addDropdown((dropdownComponent) => {
        Object.entries(INTERVAL_OPTIONS).forEach(([display, value]) => {
          dropdownComponent.addOption(String(value), display)
        })
        dropdownComponent.onChange(this.applyAutoSync.bind(this))

        if (this.plugin.settings.syncInterval != null) {
          dropdownComponent.setValue(String(this.plugin.settings.syncInterval / MS_IN_MINUTE))
        }
      })
  }

  private connect (): void {
    window.open(new URL('/obsidian-api/connect', BASE_URL))
  }

  private async openSettingsPage (): Promise<void> {
    const url = new URL('/obsidian-api/connect', BASE_URL)
    url.searchParams.set('token', String(this.plugin.settings.token))
    window.open(url)
  }

  private async disconnect (): Promise<void> {
    this.plugin.settings.token = null
    await this.plugin.saveSettings()
    this.display()
  }

  private async clearSyncState (): Promise<void> {
    this.plugin.settings.cursor = null
    await this.plugin.saveSettings()
    this.display()
  }

  private async applyAutoSync (value: string): Promise<void> {
    const interval = Number(value)

    this.plugin.unscheduleSync()

    if (interval !== 0) {
      this.plugin.settings.syncInterval = interval * MS_IN_MINUTE
      await this.plugin.rescheduleSync()
    } else {
      this.plugin.settings.syncInterval = null
      this.plugin.settings.nextSyncAt = null
    }

    await this.plugin.saveSettings()
    this.display()
  }
}
