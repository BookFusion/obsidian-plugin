import { TFile, normalizePath } from 'obsidian'
import { BookPage, HighlightBlock } from 'src/bookfusion_api'
import UpdateStrategy from './update_strategy'
import { wrapWithMagicComment } from 'src/utils'

export default class AppendStrategy extends UpdateStrategy {
  async modifyBookPage (page: BookPage, file: TFile): Promise<TFile> {
    const { highlights } = page

    if (highlights.length === 0) {
      return file
    }

    const isAtomic = highlights[0].directory != null && highlights[0].filename != null

    if (isAtomic) {
      await this.appendAtomicHighlights(highlights, file)
    } else {
      await this.appendHighlights(highlights, file)
    }

    return file
  }

  private async appendAtomicHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
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

  private async appendHighlights (highlights: HighlightBlock[], file: TFile): Promise<void> {
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
        const content = wrapWithMagicComment(highlight.id, highlight.content)
        await this.app.vault.append(file, content)
        highlightsAdded++
      }
    }

    if (highlightsAdded > 0) {
      this.plugin.events.emit('highlightModified', { filePath: file.path })
    }
  }
}
