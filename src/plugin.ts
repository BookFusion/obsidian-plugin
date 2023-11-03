/* eslint-disable no-new */
import { Notice, Plugin, TFile, TFolder, addIcon, normalizePath } from 'obsidian'
import { BookFusionPluginSettings, DEFAULT_SETTINGS } from './settings'
import { BookFusionSettingsTab } from './settings_tab'
import { initialSync } from './bookfusion_api'
import logger from './logger'
import ReportModal from './report_modal'
import SyncReport from './sync_report'
import logoSvg from '../logo.svg'

export class BookFusionPlugin extends Plugin {
  settings: BookFusionPluginSettings
  syncing: boolean = false

  async onload (): Promise<void> {
    logger.log('Plugin is loading')

    addIcon('bookfusion-logo', logoSvg)
    this.addRibbonIcon('bookfusion-logo', 'BookFusion', async () => await this.syncCommand())
    this.addCommand({ id: 'sync', name: 'Sync', callback: async () => await this.syncCommand() })

    await this.loadSettings()

    const settingsTab = new BookFusionSettingsTab(this.app, this)

    this.addSettingTab(settingsTab)

    this.registerObsidianProtocolHandler('bookfusion-connect', async ({ token }) => {
      this.settings.token = token
      await this.saveSettings()
      settingsTab.display()
    })

    logger.log('Plugin is loaded')
  }

  async onunload (): Promise<void> {
    logger.log('Plugin is unloaded')
  }

  async loadSettings (): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings (): Promise<void> {
    await this.saveData(this.settings)
  }

  private async syncCommand (): Promise<void> {
    if (this.syncing) {
      new Notice('⏳ Already syncing')
      return
    }

    if (this.settings.token == null) {
      new Notice('🛑 First you need to configure the plugin')
      return
    }

    const syncingNotice = new Notice('⏳ Sync in progress', 0)
    const report = new SyncReport()

    this.syncing = true

    try {
      for await (const page of initialSync(this.settings.token)) {
        let filePath = null

        try {
          const dirPath = normalizePath(page.directory)
          filePath = normalizePath(`${dirPath}/${page.filename}.md`)
          const directory = this.app.vault.getAbstractFileByPath(dirPath)

          if (!(directory instanceof TFolder)) {
            await this.app.vault.createFolder(dirPath)
          }

          const file = this.app.vault.getAbstractFileByPath(filePath)

          if (file instanceof TFile) {
            await this.app.vault.modify(file, page.content)
            report.bookModified(filePath)
          } else {
            await this.app.vault.create(filePath, page.content)
            report.bookCreated(filePath)
          }
        } catch (error) {
          report.bookFailed(filePath, error)
          logger.error(error)
        }
      }

      new Notice('✅ Sync completed')
      new ReportModal(this.app).display(report)
    } catch (error) {
      new Notice('⛔ Sync failed due to an error')
      logger.error(error)
    }

    this.syncing = false

    syncingNotice.hide()
  }
}
