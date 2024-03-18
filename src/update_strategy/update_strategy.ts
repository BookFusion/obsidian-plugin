import BookFusionPlugin from 'main'
import { App, TFile, TFolder, normalizePath } from 'obsidian'
import { AtomicHighlightPage, BookPage, HighlightBlock } from 'src/bookfusion_api'
import { formatHighlightContent, formatHighlightLink, wrapWithMagicComment } from '../utils'

export type UpdateStrategyId = 'append' | 'replace' | 'magic' | 'insert'

export default abstract class UpdateStrategy {
  plugin: BookFusionPlugin
  app: App

  constructor (plugin: BookFusionPlugin, app: App) {
    this.plugin = plugin
    this.app = app
  }

  async createBookPage (page: BookPage, filePath: string): Promise<TFile> {
    let content = this.wrapWithMagicComment(page.id, String(page.content))

    if (page.frontmatter != null) {
      content = `---\n${page.frontmatter}\n---\n${content}\n`
    }

    if (page.highlights.length > 0) {
      if (page.atomic_highlights) {
        for (const highlight of page.highlights as AtomicHighlightPage[]) {
          content += this.wrapWithMagicComment(highlight.id, formatHighlightLink(highlight))

          const dirPath = normalizePath(highlight.directory)
          const directory = this.app.vault.getAbstractFileByPath(dirPath)

          if (!(directory instanceof TFolder)) {
            await this.plugin.tryCreateFolder(dirPath)
          }

          await this.app.vault.create(normalizePath(`${dirPath}/${highlight.filename}`), highlight.content)
        }
      } else {
        for (const highlight of page.highlights as HighlightBlock[]) {
          content += this.wrapWithMagicComment(highlight.id, formatHighlightContent(highlight))
        }
      }

      this.plugin.events.emit('highlightModified', { filePath })
    }

    const file = await this.app.vault.create(filePath, content)

    this.plugin.events.emit('bookCreated', { filePath })

    return file
  }

  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    throw new Error('Method not implemented.')
  }

  protected wrapWithMagicComment (id: string, content: string): string {
    return wrapWithMagicComment(id, content) + '\n'
  }
}
