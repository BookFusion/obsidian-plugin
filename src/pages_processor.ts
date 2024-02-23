import { App, TFile, TFolder, normalizePath } from 'obsidian'
import { AtomicHighlightPage, BookPage, HighlightBlock, IndexPage, Page } from './bookfusion_api'
import { BookFusionPlugin } from './plugin'
import AppendStrategy from './update_strategy/append_strategy'
import ReplaceStrategy from './update_strategy/replace_strategy'
import UpdateStrategy from './update_strategy/update_strategy'
import { formatHighlightContent, formatHighlightLink, wrapWithMagicComment } from './utils'
import SmartStrategy from './update_strategy/smart_strategy'

export default class PageProcessor {
  app: App
  plugin: BookFusionPlugin

  constructor (plugin: BookFusionPlugin) {
    this.plugin = plugin
    this.app = plugin.app
  }

  async process (page: Page): Promise<void> {
    const dirPath = normalizePath(page.directory)
    const directory = this.app.vault.getAbstractFileByPath(dirPath)
    const filePath = normalizePath(`${dirPath}/${page.filename}`)

    if (!(directory instanceof TFolder)) {
      await this.plugin.tryCreateFolder(dirPath)
    }

    if (page.type === 'index') {
      await this.createOrUpdateIndexPage(page as IndexPage, filePath)
    } else {
      await this.createOrUpdateBookPage(page as BookPage, filePath)
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
      this.plugin.events.emit('bookFailed', { filePath, error })
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
      this.plugin.events.emit('indexFailed', { filePath, error })
    }
  }

  private async createIndexPage (page: IndexPage, filePath: string): Promise<TFile> {
    return await this.app.vault.create(filePath, String(page.content))
  }

  private async modifyIndexPage (page: IndexPage, file: TFile): Promise<TFile> {
    await this.app.vault.modify(file, String(page.content))

    return file
  }

  private async createBookPage (page: BookPage, filePath: string): Promise<TFile> {
    let content = wrapWithMagicComment(page.id, String(page.content))

    if (page.frontmatter != null) {
      content = `---\n${page.frontmatter}\n---\n${content}\n`
    }

    if (page.highlights.length > 0) {
      if (page.atomic_highlights) {
        for (const highlight of page.highlights as AtomicHighlightPage[]) {
          content += wrapWithMagicComment(highlight.id, formatHighlightLink(highlight))

          const dirPath = normalizePath(highlight.directory)
          const directory = this.app.vault.getAbstractFileByPath(dirPath)

          if (!(directory instanceof TFolder)) {
            await this.plugin.tryCreateFolder(dirPath)
          }

          await this.app.vault.create(normalizePath(`${dirPath}/${highlight.filename}`), highlight.content)

          this.plugin.events.emit('highlightModified', { filePath })
        }
      } else {
        for (const highlight of page.highlights as HighlightBlock[]) {
          content += wrapWithMagicComment(highlight.id, formatHighlightContent(highlight))

          this.plugin.events.emit('highlightModified', { filePath })
        }
      }
    }

    const file = await this.app.vault.create(filePath, content)

    this.plugin.events.emit('bookCreated', { filePath })

    return file
  }

  private async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    return await this.buildStrategy(page).modifyBookPage(page, file)
  }

  private buildStrategy (page: Page): UpdateStrategy {
    switch (page.update_strategy) {
      case 'replace':
        return new ReplaceStrategy(this.plugin, this.app)
      case 'magic':
        return new SmartStrategy(this.plugin, this.app, true)
      case 'insert':
        return new SmartStrategy(this.plugin, this.app, false)
      case 'append':
      default:
        return new AppendStrategy(this.plugin, this.app)
    }
  }
}
