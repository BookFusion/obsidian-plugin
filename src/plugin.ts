/* eslint-disable no-new */
import { Notice, Plugin, TFile, TFolder, addIcon, normalizePath } from 'obsidian'
import { BookFusionPluginSettings, DEFAULT_SETTINGS } from './settings'
import { BookFusionSettingsTab } from './settings_tab'
import { BookPage, IndexPage, SyncTask } from './bookfusion_api'
import logger from './logger'
import ReportModal from './report_modal'
import SyncReport from './sync_report'
import logoSvg from '../logo.svg'
import ConfirmationModal from './confirmation_modal'

const SYNC_NOTICE_TEXT = '⏳ Sync in progress'

export class BookFusionPlugin extends Plugin {
  settings: BookFusionPluginSettings
  syncTask: SyncTask
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
    this.syncTask?.abort()
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
    if (this.syncTask?.isRunning) {
      new Notice('⏳ Already syncing')
      return
    }

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
        const dirPath = normalizePath(page.directory)
        const directory = this.app.vault.getAbstractFileByPath(dirPath)
        const filePath = normalizePath(`${dirPath}/${page.filename}`)

        if (!(directory instanceof TFolder)) {
          await this.tryCreateFolder(dirPath)
        }

        if (page.type === 'index') {
          await this.createOrUpdateIndexPage(page as IndexPage, filePath)
          syncingNotice.setMessage(`${SYNC_NOTICE_TEXT}. Updating index pages.`)
        } else {
          await this.createOrUpdateBookPage(page as BookPage, filePath)
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
      logger.log('Sync completed')

      this.settings.cursor = this.syncTask.lastResponse.next_sync_cursor
      await this.saveSettings()
    } catch (error) {
      if (this.syncTask.isAborted) {
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

  private async createIndexPage (page: IndexPage, filePath: string): Promise<TFile> {
    return await this.app.vault.create(filePath, String(page.content))
  }

  private async modifyIndexPage (page: IndexPage, file: TFile): Promise<TFile> {
    await this.app.vault.modify(file, String(page.content))

    return file
  }

  private async createBookPage (page: BookPage, filePath: string): Promise<TFile> {
    let content = String(page.content)

    if (page.frontmatter != null) {
      content = `---\n${page.frontmatter}\n---\n${content}\n`
    }

    if (page.highlights.length > 0) {
      for (const highlight of page.highlights) {
        if (highlight.directory != null && highlight.filename != null) {
          // Atomic highlight strategy
          const dirPath = normalizePath(highlight.directory)
          const directory = this.app.vault.getAbstractFileByPath(dirPath)

          if (!(directory instanceof TFolder)) {
            await this.tryCreateFolder(dirPath)
          }

          await this.app.vault.create(normalizePath(`${dirPath}/${highlight.filename}`), highlight.content)
        } else {
          // Inline highlight strategy
          if (highlight.chapter_heading != null) {
            content += `${highlight.chapter_heading}\n`
          }
          content += `%%${highlight.id}%%\n${highlight.content}`
        }
      }

      this.syncReport.highlightAdded(filePath, page.highlights.length)
    }

    const file = await this.app.vault.create(filePath, content)
    this.syncReport.bookCreated(filePath)

    return file
  }

  private async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    if (page.highlights.length <= 0) {
      return file
    }

    let highlightsAdded = 0

    if (page.highlights[0].directory != null && page.highlights[0].filename != null) {
      // Atomic highlight strategy
      for (const highlight of page.highlights) {
        const dirPath = normalizePath(String(highlight.directory))
        const filePath = normalizePath(dirPath + '/' + String(highlight.filename))

        if (this.app.vault.getAbstractFileByPath(dirPath) == null) {
          await this.tryCreateFolder(dirPath)
        }

        if (this.app.vault.getAbstractFileByPath(filePath) == null) {
          await this.app.vault.create(filePath, highlight.content)
          highlightsAdded++
        }
      }
    } else {
      // Inline highlight strategy
      const content = await this.app.vault.read(file)
      const magicRegexp = /%%(highlight_.+)%%/g
      const magicIds = new Set()
      let match

      while ((match = magicRegexp.exec(content)) != null) {
        magicIds.add(match[1])
      }

      for (const highlight of page.highlights) {
        if (!magicIds.has(highlight.id)) {
          await this.app.vault.append(file, `%%${highlight.id}%%\n${highlight.content}`)
          highlightsAdded++
        }
      }
    }

    if (highlightsAdded > 0) {
      this.syncReport.highlightAdded(file.path, highlightsAdded)
    }

    return file
  }

  private async tryCreateFolder (dirPath: string): Promise<TFolder | undefined> {
    try {
      return await this.app.vault.createFolder(dirPath)
    } catch {
      logger.log(`Folder \`${dirPath}\` already exists.`)
    }
  }

  private async createOrUpdateBookPage (page: BookPage, filePath: string): Promise<TFile | undefined> {
    const file = this.app.vault.getAbstractFileByPath(filePath)

    try {
      if (file instanceof TFile) {
        return await this.modifyBookPage(page, file)
      } else {
        return await this.createBookPage(page, filePath)
      }
    } catch (error) {
      this.syncReport.bookFailed(filePath, error)
      logger.error(error)
      logger.log(this.syncTask.lastResponse)
    }
  }

  private async createOrUpdateIndexPage (page: IndexPage, filePath: string): Promise<TFile | undefined> {
    const file = this.app.vault.getAbstractFileByPath(filePath)

    try {
      if (file instanceof TFile) {
        return await this.modifyIndexPage(page, file)
      } else {
        return await this.createIndexPage(page, filePath)
      }
    } catch (error) {
      this.syncReport.indexFailed(filePath, error)
      logger.error(error)
      logger.log(this.syncTask.lastResponse)
    }
  }
}
