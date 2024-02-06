import { TFile, normalizePath } from 'obsidian'
import { BookPage, HighlightBlock } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { wrapWithMagicComment } from 'src/utils'

export default class ReplaceStrategy extends UpdateStrategy {
  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    await this.replaceBook(page, file)

    const { highlights } = page
    const isAtomic = highlights[0]?.directory != null && highlights[0]?.filename != null

    if (isAtomic) {
      await this.replaceAtomicHighlights(highlights)
    } else {
      await this.appendHighlights(highlights, file)
    }

    return file
  }

  private async replaceBook (page: BookPage, file: TFile): Promise<void> {
    let content = String(page.content)

    if (page.frontmatter != null) {
      content = `---\n${page.frontmatter}\n---\n${content}\n`
    }

    await this.app.vault.modify(file, content)

    this.plugin.events.emit('bookModified', { filePath: file.path })
  }

  private async replaceAtomicHighlights (highlights: HighlightBlock[]): Promise<void> {
    for (const highlight of highlights) {
      const dirPath = normalizePath(String(highlight.directory))
      const filePath = normalizePath(dirPath + '/' + String(highlight.filename))

      if (this.app.vault.getAbstractFileByPath(dirPath) == null) {
        await this.plugin.tryCreateFolder(dirPath)
      }

      const file = this.app.vault.getAbstractFileByPath(filePath)

      if (file instanceof TFile) {
        await this.app.vault.modify(file, highlight.content)
        this.plugin.events.emit('highlightModified', { filePath })
      } else if (file == null) {
        await this.app.vault.create(filePath, highlight.content)
        this.plugin.events.emit('highlightModified', { filePath })
      }
    }
  }

  private async appendHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
    if (highlights.length === 0) {
      return
    }

    for (const highlight of highlights) {
      let content = wrapWithMagicComment(highlight.id, highlight.content)

      if (highlight.chapter_heading != null) {
        content = `${highlight.chapter_heading}\n${content}`
      }

      await this.app.vault.append(file, content)
    }

    this.plugin.events.emit('highlightModified', { filePath: file.path, count: highlights.length })
  }
}
