/* eslint-disable no-new */
import { Notice, Plugin, TFile, TFolder, addIcon, normalizePath } from 'obsidian'
import { BookFusionPluginSettings, DEFAULT_SETTINGS } from './settings'
import { BookFusionSettingsTab } from './settings_tab'
import { Page, BookPage, initialSync } from './bookfusion_api'
import logger from './logger'
import ReportModal from './report_modal'
import SyncReport from './sync_report'
import logoSvg from '../logo.svg'
import ConfirmationModal from './confirmation_modal'

const SYNC_NOTICE_TEXT = '⏳ Sync in progress'

export class BookFusionPlugin extends Plugin {
  settings: BookFusionPluginSettings
  syncing: boolean = false
  syncAbortController: AbortController
  syncReport: SyncReport

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

    logger.log('Plugin is loaded')
  }

  async onunload (): Promise<void> {
    this.syncAbortController?.abort()
    logger.log('Plugin is unloaded')
  }

  async loadSettings (): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData())
  }

  async saveSettings (): Promise<void> {
    await this.saveData(this.settings)
  }

  private async requestSync (): Promise<void> {
    if (this.syncing) {
      return await new Promise((resolve, _reject) => {
        const confirm =
          new ConfirmationModal(this.app, 'The sync process is currently in progress. Do you want to stop it?')
        confirm.onPositive = () => {
          this.syncAbortController.abort()
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
    this.syncAbortController = new AbortController()
    this.syncReport = new SyncReport()

    let booksProcessed = 0

    try {
      for await (const page of initialSync({ token: this.settings.token, signal: this.syncAbortController.signal })) {
        let filePath = null

        try {
          const dirPath = normalizePath(page.directory)
          filePath = normalizePath(`${dirPath}/${page.filename}`)
          const directory = this.app.vault.getAbstractFileByPath(dirPath)

          if (!(directory instanceof TFolder)) {
            try {
              await this.app.vault.createFolder(dirPath)
            } catch {
              logger.log(`Folder \`${dirPath}\` already exists.`)
            }
          }

          const file = this.app.vault.getAbstractFileByPath(filePath)

          switch (page.type) {
            case 'index':
              if (file instanceof TFile) {
                await this.modifyIndexPage(page, file)
              } else {
                await this.createIndexPage(page, filePath)
              }
              syncingNotice.setMessage(`${SYNC_NOTICE_TEXT}. Updating index pages.`)
              break
            case 'book':
            default:
              if (file instanceof TFile) {
                await this.modifyBookPage(page as BookPage, file)
              } else {
                await this.createBookPage(page as BookPage, filePath)
              }
              syncingNotice.setMessage(`${SYNC_NOTICE_TEXT}. ${++booksProcessed} book(s) processed`)
          }
        } catch (error) {
          this.syncReport.indexFailed(filePath, error)
          logger.error(error)
        }
      }

      new Notice('✅ Sync completed')
      new ReportModal(this.app).display(this.syncReport)
      logger.log('Sync completed')
    } catch (error) {
      if (this.syncAbortController.signal.aborted) {
        new Notice('🛑 Sync stopped by user')
        logger.log('Sync stopped by user')
      } else {
        new Notice('💥 Sync failed due to an error')
        logger.error(error)
      }
    }

    this.syncing = false

    syncingNotice.hide()
  }

  private async createIndexPage (page: Page, filePath: string): Promise<TFile> {
    const content = String(page.content)

    const file = await this.app.vault.create(filePath, content)

    return file
  }

  private async modifyIndexPage (page: Page, file: TFile): Promise<TFile> {
    const content = String(page.content)

    await this.app.vault.modify(file, content)

    return file
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
