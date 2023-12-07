/* eslint-disable no-new */
import { Notice, Plugin, TFile, TFolder, addIcon, normalizePath } from 'obsidian'
import { BookFusionPluginSettings, DEFAULT_SETTINGS } from './settings'
import { BookFusionSettingsTab } from './settings_tab'
import { BookPage, initialSync } from './bookfusion_api'
import logger from './logger'
import ReportModal from './report_modal'
import SyncReport from './sync_report'
import logoSvg from '../logo.svg'

const SYNC_NOTICE_TEXT = '⏳ Sync in progress'

export class BookFusionPlugin extends Plugin {
  settings: BookFusionPluginSettings
  syncing: boolean = false
  syncReport: SyncReport

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

    const syncingNotice = new Notice(SYNC_NOTICE_TEXT, 0)
    logger.log('Sync in progress')

    this.syncing = true
    this.syncReport = new SyncReport()

    let booksProcessed = 0

    try {
      for await (const page of initialSync(this.settings.token)) {
        let filePath = null

        try {
          const dirPath = normalizePath(page.directory)
          filePath = normalizePath(`${dirPath}/${page.filename}`)
          const directory = this.app.vault.getAbstractFileByPath(dirPath)

          if (!(directory instanceof TFolder)) {
            await this.app.vault.createFolder(dirPath)
          }

          const file = this.app.vault.getAbstractFileByPath(filePath)

          if (file instanceof TFile) {
            await this.modifyBookPage(page, file)
          } else {
            await this.createBookPage(page, filePath)
          }

          syncingNotice.setMessage(`${SYNC_NOTICE_TEXT}. ${++booksProcessed} book(s) processed`)
        } catch (error) {
          this.syncReport.bookFailed(filePath, error)
          logger.error(error)
        }
      }

      new Notice('✅ Sync completed')
      new ReportModal(this.app).display(this.syncReport)
      logger.log('Sync completed')
    } catch (error) {
      new Notice('⛔ Sync failed due to an error')
      logger.error(error)
    }

    this.syncing = false

    syncingNotice.hide()
  }

  private async createBookPage (page: BookPage, filePath: string): Promise<TFile> {
    let content = String(page.content)

    if (page.frontmatter != null) {
      content = `---\n${page.frontmatter}\n---\n${content}\n`
    }

    if (page.highlights.length > 0) {
      page.highlights.forEach((highlight) => {
        if (highlight.chapter_heading != null) {
          content += `${highlight.chapter_heading}\n`
        }
        content += `%%${highlight.id}%%\n${highlight.content}`
      })

      this.syncReport.highlightAdded(filePath, page.highlights.length)
    }

    const file = await this.app.vault.create(filePath, content)
    this.syncReport.bookCreated(filePath)

    return file
  }

  private async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    const content = await this.app.vault.read(file)
    const magicRegexp = /%%(highlight_.+)%%/g
    const magicIds = new Set()
    let match
    let highlightsAdded = 0

    while ((match = magicRegexp.exec(content)) != null) {
      magicIds.add(match[1])
    }

    for await (const highlight of page.highlights) {
      if (!magicIds.has(highlight.id)) {
        await this.app.vault.append(file, `%%${highlight.id}%%\n${highlight.content}`)
        highlightsAdded++
      }
    }

    if (highlightsAdded > 0) {
      this.syncReport.highlightAdded(file.path, highlightsAdded)
    }

    return file
  }
}
