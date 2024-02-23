import { TFile, normalizePath } from 'obsidian'
import { AtomicHighlightPage, BookPage, HighlightBlock } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { wrapWithMagicComment } from 'src/utils'

export default class AppendStrategy extends UpdateStrategy {
  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    const { highlights } = page

    if (highlights.length === 0) {
      return file
    }

    if (page.atomic_highlights) {
      const formatter = (highlight: AtomicHighlightPage): string => wrapWithMagicComment(highlight.id, highlight.link)

      await this.appendAtomicHighlights(highlights as AtomicHighlightPage[], file)
      await this.appendHighlights(highlights as AtomicHighlightPage[], file, formatter)
    } else {
      const formatter = (highlight: HighlightBlock): string => wrapWithMagicComment(highlight.id, highlight.content)

      await this.appendHighlights(highlights as HighlightBlock[], file, formatter)
    }

    return file
  }

  private async appendAtomicHighlights (highlights: AtomicHighlightPage[], file: TFile): Promise<void> {
    for (const highlight of highlights) {
      const dirPath = normalizePath(String(highlight.directory))
      const filePath = normalizePath(dirPath + '/' + String(highlight.filename))

      if (this.app.vault.getAbstractFileByPath(dirPath) == null) {
        await this.plugin.tryCreateFolder(dirPath)
      }

      if (this.app.vault.getAbstractFileByPath(filePath) == null) {
        await this.app.vault.create(filePath, highlight.content)
        this.plugin.events.emit('highlightModified', { filePath: file.path })
      }
    }
  }

  private async appendHighlights (highlights: HighlightBlock[], file: TFile, formatter: (highlight: HighlightBlock) => string): Promise<void> {
    const content = await this.app.vault.read(file)
    const magicRegexp = /%%begin-(highlight-.+)%%/g
    const magicIds = new Set()
    let highlightsAdded = 0
    let match

    while ((match = magicRegexp.exec(content)) != null) {
      magicIds.add(match[1])
    }

    for (const highlight of highlights) {
      if (!magicIds.has(highlight.id)) {
        await this.app.vault.append(file, formatter(highlight))
        highlightsAdded++
      }
    }

    if (highlightsAdded > 0) {
      this.plugin.events.emit('highlightModified', { filePath: file.path, count: highlightsAdded })
    }
  }
}
