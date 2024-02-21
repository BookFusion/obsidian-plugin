import { TFile, normalizePath } from 'obsidian'
import { AtomicHighlightPage, BookPage, HighlightBlock, SomeHighlight } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { formatHighlightContent, formatHighlightLink, wrapWithMagicComment } from 'src/utils'

export default class ReplaceStrategy extends UpdateStrategy {
  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    await this.replaceBook(page, file)

    const { highlights } = page

    if (page.atomic_highlights) {
      const formatter = (highlight: AtomicHighlightPage): string => {
        return wrapWithMagicComment(highlight.id, formatHighlightLink(highlight))
      }

      await this.appendHighlights(highlights as HighlightBlock[], file, formatter)
      await this.replaceAtomicHighlights(highlights as AtomicHighlightPage[])
    } else {
      const formatter = (highlight: HighlightBlock): string => {
        return wrapWithMagicComment(highlight.id, formatHighlightContent(highlight))
      }

      await this.appendHighlights(highlights as HighlightBlock[], file, formatter)
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

  private async replaceAtomicHighlights (highlights: AtomicHighlightPage[]): Promise<void> {
    for (const highlight of highlights) {
      const dirPath = normalizePath(String(highlight.directory))
      const filePath = normalizePath(dirPath + '/' + String(highlight.filename))

      if (this.app.vault.getAbstractFileByPath(dirPath) == null) {
        await this.plugin.tryCreateFolder(dirPath)
      }

      const highlightFile = this.app.vault.getAbstractFileByPath(filePath)

      if (highlightFile instanceof TFile) {
        await this.app.vault.modify(highlightFile, highlight.content)
      } else if (highlightFile == null) {
        await this.app.vault.create(filePath, highlight.content)
      }
    }
  }

  private async appendHighlights (highlights: SomeHighlight[], file: TFile, formatter: (highlight: SomeHighlight) => string): Promise<void> {
    if (highlights.length === 0) {
      return
    }

    for (const highlight of highlights) {
      await this.app.vault.append(file, formatter(highlight))
      this.plugin.events.emit('highlightModified', { filePath: file.path })
    }
  }
}
