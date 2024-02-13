/* eslint-disable no-new */
import { App, Notice, Plugin, PluginManifest, TFolder, addIcon } from 'obsidian'
import { BookFusionPluginSettings, DEFAULT_SETTINGS } from './settings'
import { BookFusionSettingsTab } from './settings_tab'
import { SubscriptionRequiredError, SyncTask } from './bookfusion_api'
import logger from './logger'
import ReportModal from './report_modal'
import SyncReport from './sync_report'
import logoSvg from '../logo.svg'
import ConfirmationModal from './confirmation_modal'
import PageProcessor from './pages_processor'
import EventEmitter from './event_emitter'
import SyncReportPrinter from './sync_report_printer'

const SYNC_NOTICE_TEXT = '⏳ Sync in progress'

export class BookFusionPlugin extends Plugin {
  settings: BookFusionPluginSettings
  syncTimer: number | null
  syncTask: SyncTask
  syncReport: SyncReport
  events: EventEmitter
  pageProcessor: PageProcessor

  constructor (app: App, manifest: PluginManifest) {
    super(app, manifest)
    this.events = new EventEmitter()
    this.pageProcessor = new PageProcessor(this)

    this.events.on('folderFailed', ({ dirPath }) => {
      logger.log(`Folder \`${String(dirPath)}\` already exists.`)
    })

    this.events.on('indexFailed', ({ filePath, error }) => {
      this.syncReport.indexFailed(filePath, error)
      logger.error(error)
      logger.log(this.syncTask.lastResponse)
    })

    this.events.on('bookCreated', ({ filePath }) => {
      this.syncReport.bookCreated(filePath)
    })

    this.events.on('bookModified', ({ filePath }) => {
      this.syncReport.bookModified(filePath)
    })

    this.events.on('bookFailed', ({ filePath, error }) => {
      this.syncReport.bookFailed(filePath, error)
      logger.error(error)
      logger.log(this.syncTask.lastResponse)
    })

    this.events.on('highlightModified', ({ filePath }) => {
      this.syncReport.highlightModified(filePath)
    })
  }

  async onload (): Promise<void> {
    logger.log('Plugin is loading')

    addIcon('bookfusion-logo', logoSvg)
    this.addRibbonIcon('bookfusion-logo', 'BookFusion', async () => await this.requestSync())
    this.addCommand({ id: 'sync', name: 'Sync', callback: async () => await this.requestSync() })

    await this.loadSettings()

    const settingsTab = new BookFusionSettingsTab(this.app, this)

    this.addSettingTab(settingsTab)

    this.registerObsidianProtocolHandler('bookfusion-connect', async ({ token }) => {
      this.settings.token = token
      await this.saveSettings()
      settingsTab.display()
    })

    this.scheduleSync()

    logger.log('Plugin is loaded')
  }

  async onunload (): Promise<void> {
    this.syncTask?.abort()
    this.unscheduleSync()
    logger.log('Plugin is unloaded')
  }

  async loadSettings (): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings (): Promise<void> {
    await this.saveData(this.settings)
  }

  private async requestSync (): Promise<void> {
    if (this.syncTask?.isRunning) {
      return await new Promise((resolve, _reject) => {
        const confirm =
          new ConfirmationModal(this.app, 'The sync process is currently in progress. Do you want to stop it?')
        confirm.onPositive = () => {
          this.syncTask.abort()
          resolve()
        }
        confirm.onNegative = () => {
          resolve()
        }
        confirm.open()
      })
    } else {
      return await this.syncCommand()
    }
  }

  private async syncCommand (): Promise<void> {
    if (this.settings.token == null) {
      new Notice('🛑 First you need to configure the plugin')
      return
    }

    const syncingNotice = new Notice(SYNC_NOTICE_TEXT, 0)
    logger.log('Sync in progress')

    this.syncTask = new SyncTask({ token: this.settings.token })
    this.syncReport = new SyncReport()

    let pagesProcessed = 0
    let booksProcessed = 0

    try {
      for await (const page of this.syncTask.run(this.settings.cursor)) {
        await this.pageProcessor.process(page)

        if (page.type === 'index') {
          syncingNotice.setMessage(`${SYNC_NOTICE_TEXT}. Updating index pages.`)
        } else {
          syncingNotice.setMessage(`${SYNC_NOTICE_TEXT}. ${++booksProcessed} book(s) processed`)
        }

        pagesProcessed++
      }

      {
        let message = '✅ Sync completed'
        if (pagesProcessed === 0) message += '. No updates'
        new Notice(message)
      }

      new ReportModal(this.app).display(this.syncReport)
      new SyncReportPrinter(this.app).append(this.syncReport)
      logger.log('Sync completed')

      this.settings.cursor = this.syncTask.lastResponse.next_sync_cursor
      await this.saveSettings()
    } catch (error) {
      if (error instanceof SubscriptionRequiredError) {
        new Notice('⬆️ ' + error.message)
        logger.error(error)
      } else if (this.syncTask.isAborted) {
        new Notice('🛑 Sync stopped by user')
        logger.log('Sync stopped by user')
      } else {
        new Notice('💥 Sync failed due to an error')
        logger.error(error)
        logger.log(this.syncTask.lastResponse)
      }
    }

    syncingNotice.hide()
  }

  private async syncTimerHandler (): Promise<void> {
    if (this.syncTask?.isRunning) return

    await this.syncCommand()
    await this.rescheduleSync()
  }

  scheduleSync (): void {
    if (this.settings.nextSyncAt == null) return

    const timeout = this.settings.nextSyncAt - Date.now()

    this.syncTimer = window.setTimeout(this.syncTimerHandler.bind(this), timeout)
  }

  async rescheduleSync (): Promise<void> {
    if (this.settings.syncInterval == null) return

    this.settings.nextSyncAt = Date.now() + this.settings.syncInterval
    await this.saveSettings()
    this.scheduleSync()
  }

  unscheduleSync (): void {
    if (this.syncTimer == null) return

    clearTimeout(this.syncTimer)
    this.syncTimer = null
  }

  async tryCreateFolder (dirPath: string): Promise<TFolder | undefined> {
    try {
      return await this.app.vault.createFolder(dirPath)
    } catch {
      this.events.emit('folderFailed', { dirPath })
    }
  }
}
